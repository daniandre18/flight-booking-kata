import { ActivityEntryDtoSchema, FlightStatsDtoSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { bookingBody, holdSeats, postBooking } from '../support/bookings';
import { createTestApp, type TestApp } from '../support/test-app';

describe('Tablero: estadísticas y registro de actividad (HU4, CE-005)', () => {
  let ctx: TestApp;
  const get = (path: string) => request(ctx.app.getHttpServer()).get(path);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /stats suma 180 con vista perezosa y occupancyPercent = reservados ÷ total', async () => {
    const flightId = await ctx.createFlight();
    const buyer = randomUUID();
    await holdSeats(ctx, flightId, buyer, ['1A', '1B', '1C']);
    await postBooking(
      ctx,
      buyer,
      bookingBody(flightId, { '1A': 'Ana Gómez', '1B': 'Luis Pérez', '1C': 'Eva Ríos' }),
    ).expect(201);
    await holdSeats(ctx, flightId, randomUUID(), ['2A', '2B']);

    const held = FlightStatsDtoSchema.parse(
      (await get(`/api/flights/${flightId}/stats`).expect(200)).body,
    );
    expect(held).toEqual({
      flightId,
      seq: 8,
      available: 175,
      held: 2,
      booked: 3,
      total: 180,
      occupancyPercent: 1.7,
    });

    ctx.clock.advance(600_000);
    const expired = (await get(`/api/flights/${flightId}/stats`).expect(200)).body;
    expect(expired).toMatchObject({ available: 177, held: 0, booked: 3, total: 180 });
  });

  it('GET /events devuelve los últimos 50, el más reciente primero', async () => {
    const flightId = await ctx.createFlight();
    const seats = Array.from({ length: 28 }, (_, index) => `${index + 1}A`);
    for (const seatId of seats) {
      const clientId = randomUUID();
      await holdSeats(ctx, flightId, clientId, [seatId]);
      await request(ctx.app.getHttpServer())
        .delete(`/api/flights/${flightId}/seats/${seatId}/hold`)
        .set('X-Client-Id', clientId)
        .expect(204);
    }

    const response = await get(`/api/flights/${flightId}/events`).expect(200);
    const entries = ActivityEntryDtoSchema.array().parse(response.body);
    expect(entries).toHaveLength(50);
    expect(entries[0]).toMatchObject({
      seq: 56,
      type: 'SEAT_RELEASED',
      seatId: '28A',
      status: 'AVAILABLE',
      reason: 'MANUAL',
    });
    expect(entries[1]).toMatchObject({ seq: 55, type: 'SEAT_HELD', seatId: '28A', status: 'HELD' });
    expect(entries.at(-1)?.seq).toBe(7);

    const limited = await get(`/api/flights/${flightId}/events?limit=3`).expect(200);
    expect(limited.body.map((entry: { seq: number }) => entry.seq)).toEqual([56, 55, 54]);
  });

  it('valida limit y responde 404 si el vuelo no existe', async () => {
    const flightId = await ctx.createFlight();
    await get(`/api/flights/${flightId}/events?limit=0`).expect(422);
    await get(`/api/flights/${flightId}/events?limit=101`).expect(422);
    await expect(get(`/api/flights/${flightId}/events`).expect(200)).resolves.toMatchObject({
      body: [],
    });
    expect((await get(`/api/flights/${randomUUID()}/stats`).expect(404)).body.code).toBe(
      'FLIGHT_NOT_FOUND',
    );
    expect((await get(`/api/flights/${randomUUID()}/events`).expect(404)).body.code).toBe(
      'FLIGHT_NOT_FOUND',
    );
  });
});
