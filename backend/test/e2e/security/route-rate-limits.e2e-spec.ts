import { ErrorResponseSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { RATE_LIMITS } from '../../../src/shared-kernel/infrastructure/http/rate-limits';
import { createTestApp, type TestApp } from '../support/test-app';

/**
 * Límites por ruta real con multiplicador 1 (principio X, research.md §25). El throttler cuenta
 * antes de validar, así que las solicitudes rechazadas por otra razón (401, 404, 422) también
 * suman: lo que importa es que la ruta corta en el límite con 429.
 */
describe('Límites por ruta (T178)', () => {
  let ctx: TestApp;
  let flightId: string;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    flightId = await ctx.createFlight();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function expectLimit(limit: number, send: () => request.Test): Promise<void> {
    for (let i = 0; i < limit; i += 1) {
      const response = await send();
      expect(response.status).not.toBe(429);
    }
    const blocked = await send().expect(429);
    expect(ErrorResponseSchema.parse(blocked.body)).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Demasiados intentos, espera un momento.',
      details: null,
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  }

  it('bloqueo: 20 por cliente cada 10 s', async () => {
    const clientId = randomUUID();
    await expectLimit(RATE_LIMITS.holds.client.limit, () =>
      request(server())
        .post(`/api/flights/${flightId}/seats/31A/hold`)
        .set('X-Client-Id', clientId),
    );
  });

  it('liberación: 20 por cliente cada 10 s', async () => {
    const clientId = randomUUID();
    await expectLimit(RATE_LIMITS.holds.client.limit, () =>
      request(server())
        .delete(`/api/flights/${flightId}/seats/1A/hold`)
        .set('X-Client-Id', clientId),
    );
  });

  it('confirmación: 5 por cliente por minuto', async () => {
    const clientId = randomUUID();
    await expectLimit(RATE_LIMITS.booking.client.limit, () =>
      request(server())
        .post('/api/bookings')
        .set('X-Client-Id', clientId)
        .set('Idempotency-Key', randomUUID())
        .send({}),
    );
  });

  it('consulta del boleto: 10 por IP por minuto; rotar X-Client-Id no lo evade', async () => {
    await expectLimit(RATE_LIMITS.lookup.ip.limit, () =>
      request(server())
        .post('/api/bookings/lookup')
        .set('X-Client-Id', randomUUID())
        .send({ code: 'ABC123', email: 'nadie@correo.co' }),
    );
  });

  it('admin: 20 por IP por minuto; rotar X-Client-Id no lo evade', async () => {
    await expectLimit(RATE_LIMITS.admin.ip.limit, () =>
      request(server())
        .patch(`/api/admin/flights/${flightId}/status`)
        .set('X-Client-Id', randomUUID())
        .set('X-Admin-Key', 'incorrecta')
        .send({ status: 'CANCELLED' }),
    );
  });
});
