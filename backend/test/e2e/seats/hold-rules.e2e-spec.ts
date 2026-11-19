import { HoldSeatResponseSchema, SeatMapSnapshotSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { holderTagOf } from '../../../src/shared-kernel/domain/holder-tag';
import { createTestApp, type TestApp } from '../support/test-app';

describe('Reglas de bloqueo (HU2)', () => {
  let ctx: TestApp;
  const server = () => ctx.app.getHttpServer();
  const hold = (flightId: string, seatId: string, clientId: string) =>
    request(server())
      .post(`/api/flights/${flightId}/seats/${seatId}/hold`)
      .set('X-Client-Id', clientId);
  const release = (flightId: string, seatId: string, clientId: string) =>
    request(server())
      .delete(`/api/flights/${flightId}/seats/${seatId}/hold`)
      .set('X-Client-Id', clientId);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await ctx.close();
  });

  it('bloquea un asiento y devuelve vencimiento, holderTag y seq según el contrato', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    const response = await hold(flightId, '12C', clientId).expect(201);
    const body = HoldSeatResponseSchema.parse(response.body);
    expect(body).toMatchObject({
      flightId,
      seatId: '12C',
      holderTag: holderTagOf(clientId),
      seq: 1,
    });
    expect(new Date(body.holdExpiresAt).getTime() - ctx.clock.now().getTime()).toBe(600_000);
  });

  it('el segundo asiento vence a la misma hora que el primero (reloj compartido)', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    const first = await hold(flightId, '12C', clientId).expect(201);
    ctx.clock.advance(60_000);
    const second = await hold(flightId, '12D', clientId).expect(201);
    expect(second.body.holdExpiresAt).toBe(first.body.holdExpiresAt);
  });

  it('el quinto bloqueo del mismo cliente da 422 HOLD_LIMIT_REACHED', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    for (const seat of ['1A', '1B', '1C', '1D']) {
      await hold(flightId, seat, clientId).expect(201);
    }
    const response = await hold(flightId, '1E', clientId).expect(422);
    expect(response.body.code).toBe('HOLD_LIMIT_REACHED');
  });

  it('libera el propio (204) y no el ajeno (409 SEAT_NOT_HELD)', async () => {
    const flightId = await ctx.createFlight();
    const owner = randomUUID();
    await hold(flightId, '12C', owner).expect(201);
    const foreign = await release(flightId, '12C', randomUUID()).expect(409);
    expect(foreign.body.code).toBe('SEAT_NOT_HELD');
    await release(flightId, '12C', owner).expect(204);
    const seat = await ctx.prisma.seat.findFirstOrThrow({
      where: { flightId, row: 12, letter: 'C' },
    });
    expect(seat).toMatchObject({ status: 'AVAILABLE', heldBy: null, holdExpiresAt: null });
  });

  it.each([
    ['cancelado', { status: 'CANCELLED' as const }],
    ['agotado', { status: 'SOLD_OUT' as const }],
  ])('un vuelo %s da 422 FLIGHT_NOT_BOOKABLE', async (_case, overrides) => {
    const flightId = await ctx.createFlight(overrides);
    const response = await hold(flightId, '12C', randomUUID()).expect(422);
    expect(response.body.code).toBe('FLIGHT_NOT_BOOKABLE');
  });

  it('un vuelo que ya salió da 422 FLIGHT_NOT_BOOKABLE', async () => {
    const flightId = await ctx.createFlight({
      departureAt: new Date(ctx.clock.now().getTime() - 60_000),
    });
    await hold(flightId, '12C', randomUUID()).expect(422);
  });

  it('otro cliente toma un bloqueo vencido (201)', async () => {
    const flightId = await ctx.createFlight();
    await hold(flightId, '12C', randomUUID()).expect(201);
    ctx.clock.advance(601_000);
    await hold(flightId, '12C', randomUUID()).expect(201);
  });

  it.each([
    ['sin X-Client-Id', undefined],
    ['con un UUID que no es v4', 'a43ba235-6321-5a88-b282-0af2d4095301'],
  ])('%s responde 400 CLIENT_ID_REQUIRED', async (_case, clientId) => {
    const flightId = await ctx.createFlight();
    const call = request(server()).post(`/api/flights/${flightId}/seats/12C/hold`);
    const response = await (
      clientId === undefined ? call : call.set('X-Client-Id', clientId)
    ).expect(400);
    expect(response.body.code).toBe('CLIENT_ID_REQUIRED');
  });

  it('valida los parámetros de ruta (422 VALIDATION_ERROR) y el vuelo inexistente (404)', async () => {
    const invalid = await hold('no-es-uuid', '99Z', randomUUID()).expect(422);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    const missing = await hold(randomUUID(), '12C', randomUUID()).expect(404);
    expect(missing.body.code).toBe('FLIGHT_NOT_FOUND');
  });

  it('GET /api/clients/me/holds devuelve asientos, vencimiento y holderTag', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    const held = await hold(flightId, '12C', clientId).expect(201);
    await hold(flightId, '12D', clientId).expect(201);
    const response = await request(server())
      .get('/api/clients/me/holds')
      .set('X-Client-Id', clientId)
      .expect(200);
    expect(response.body).toEqual({
      holderTag: holderTagOf(clientId),
      serverNow: expect.any(String),
      holds: [{ flightId, seatIds: ['12C', '12D'], holdExpiresAt: held.body.holdExpiresAt }],
    });
  });

  it('GET /api/clients/me/holds?flightId= filtra por vuelo y valida el uuid', async () => {
    const first = await ctx.createFlight();
    const second = await ctx.createFlight({ destination: 'CLO' });
    const clientId = randomUUID();
    await hold(first, '1A', clientId).expect(201);
    await hold(second, '2B', clientId).expect(201);
    const mine = (query: string) =>
      request(server()).get(`/api/clients/me/holds${query}`).set('X-Client-Id', clientId);
    const filtered = await mine(`?flightId=${second}`).expect(200);
    expect(filtered.body.holds).toEqual([
      expect.objectContaining({ flightId: second, seatIds: ['2B'] }),
    ]);
    const all = await mine('').expect(200);
    expect(all.body.holds).toHaveLength(2);
    const invalid = await mine('?flightId=no-es-uuid').expect(422);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('el snapshot trae una seq coherente con los asientos y nunca expone el clientId', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    await hold(flightId, '12C', clientId).expect(201);
    await hold(flightId, '12D', clientId).expect(201);
    const response = await request(server()).get(`/api/flights/${flightId}/seats`).expect(200);
    const snapshot = SeatMapSnapshotSchema.parse(response.body);
    const heldSeats = snapshot.seats.filter((seat) => seat.status === 'HELD');
    expect(snapshot.seq).toBe(2);
    expect(snapshot.flight.seq).toBe(2);
    expect(heldSeats.map((seat) => seat.seatId)).toEqual(['12C', '12D']);
    expect(snapshot.flight.availableSeats).toBe(178);
    expect(JSON.stringify(response.body)).not.toContain(clientId);
  });
});
