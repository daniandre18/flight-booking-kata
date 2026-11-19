import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp, type TestApp } from '../support/test-app';

/**
 * Prueba crítica del principio V: N solicitudes paralelas sobre el mismo asiento producen
 * exactamente 1 éxito y N−1 conflictos, contra PostgreSQL real (CE-001).
 */
describe('Concurrencia: 100 bloqueos simultáneos del mismo asiento', () => {
  const PARALLEL = 100;
  let ctx: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen(0, '127.0.0.1');
    baseUrl = await ctx.app.getUrl();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('exactamente 1 respuesta 201, 99 respuestas 409 SEAT_UNAVAILABLE y ningún 500', async () => {
    const flightId = await ctx.createFlight();
    const clients = Array.from({ length: PARALLEL }, () => randomUUID());

    const responses = await Promise.all(
      clients.map((clientId) =>
        request(baseUrl)
          .post(`/api/flights/${flightId}/seats/12C/hold`)
          .set('X-Client-Id', clientId),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(PARALLEL - 1);
    expect(statuses.filter((status) => status >= 500)).toHaveLength(0);
    const conflicts = responses.filter((response) => response.status === 409);
    expect(conflicts.every((response) => response.body.code === 'SEAT_UNAVAILABLE')).toBe(true);

    const winnerIndex = statuses.indexOf(201);
    const held = await ctx.prisma.seat.findMany({ where: { flightId, status: 'HELD' } });
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ row: 12, letter: 'C', heldBy: clients[winnerIndex] });
    const events = await ctx.prisma.flightEvent.findMany({ where: { flightId } });
    expect(events).toHaveLength(1);
  });
});
