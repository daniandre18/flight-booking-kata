import { FlightDtoSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { bookingBody, holdSeats, postBooking } from '../support/bookings';
import { closeSockets, collect, connectSocket, joinFlight, waitForEvent } from '../support/sockets';
import { createTestApp, TEST_ADMIN_KEY, type TestApp } from '../support/test-app';

const HOUR = 3_600_000;

describe('Administración: retraso y cancelación (HU4, principio V.5)', () => {
  let ctx: TestApp;
  let baseUrl: string;
  const patch = (flightId: string, body: object, key: string | null = TEST_ADMIN_KEY) => {
    const call = request(ctx.app.getHttpServer()).patch(`/api/admin/flights/${flightId}/status`);
    return (key === null ? call : call.set('X-Admin-Key', key)).send(body);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    baseUrl = await ctx.listen();
  });

  beforeEach(() => ctx.reset());

  afterEach(() => closeSockets());

  afterAll(async () => {
    await ctx.close();
  });

  it('sin clave o con clave incorrecta → 401 ADMIN_UNAUTHORIZED, sin cambios', async () => {
    const flightId = await ctx.createFlight();
    const missing = await patch(flightId, { status: 'CANCELLED' }, null).expect(401);
    expect(missing.body).toEqual({
      code: 'ADMIN_UNAUTHORIZED',
      message: 'La clave de administrador es incorrecta',
      details: null,
    });
    const wrong = await patch(flightId, { status: 'CANCELLED' }, 'incorrecta').expect(401);
    expect(wrong.body.code).toBe('ADMIN_UNAUTHORIZED');
    const flight = await ctx.prisma.flight.findUniqueOrThrow({ where: { id: flightId } });
    expect(flight.status).toBe('SCHEDULED');
  });

  it('retraso válido → DELAYED con horas desplazadas y flight:updated en el room', async () => {
    const departureAt = new Date(ctx.clock.now().getTime() + 24 * HOUR);
    const flightId = await ctx.createFlight({ departureAt, durationMinutes: 75 });
    const observer = await connectSocket(baseUrl);
    await joinFlight(observer, flightId);
    const updated = waitForEvent(observer, 'flight:updated');
    const newDepartureAt = new Date(departureAt.getTime() + 2 * HOUR);

    const response = await patch(flightId, {
      status: 'DELAYED',
      newDepartureAt: newDepartureAt.toISOString(),
    }).expect(200);

    expect(FlightDtoSchema.parse(response.body)).toMatchObject({
      status: 'DELAYED',
      delayed: true,
      departureAt: newDepartureAt.toISOString(),
      arrivalAt: new Date(newDepartureAt.getTime() + 75 * 60_000).toISOString(),
      scheduledDepartureAt: departureAt.toISOString(),
      durationMinutes: 75,
      seq: 1,
    });
    await expect(updated).resolves.toMatchObject({
      seq: 1,
      status: 'DELAYED',
      change: 'DELAYED',
      delayed: true,
    });
  });

  it('una nueva hora no posterior a la salida → 422 INVALID_DELAY', async () => {
    const departureAt = new Date(ctx.clock.now().getTime() + 24 * HOUR);
    const flightId = await ctx.createFlight({ departureAt });
    const response = await patch(flightId, {
      status: 'DELAYED',
      newDepartureAt: departureAt.toISOString(),
    }).expect(422);
    expect(response.body.code).toBe('INVALID_DELAY');
  });

  it('retrasar un vuelo SOLD_OUT conserva SOLD_OUT', async () => {
    const departureAt = new Date(ctx.clock.now().getTime() + 24 * HOUR);
    const flightId = await ctx.createFlight({ departureAt, status: 'SOLD_OUT' });
    const response = await patch(flightId, {
      status: 'DELAYED',
      newDepartureAt: new Date(departureAt.getTime() + HOUR).toISOString(),
    }).expect(200);
    expect(response.body).toMatchObject({ status: 'SOLD_OUT', delayed: true });
  });

  it('cancelar con bloqueos activos los libera, emite FLIGHT_CANCELLED y luego no deja bloquear ni confirmar', async () => {
    const flightId = await ctx.createFlight();
    const holder = randomUUID();
    await holdSeats(ctx, flightId, holder, ['12C', '12D']);
    await holdSeats(ctx, flightId, randomUUID(), ['1A']);
    const observer = await connectSocket(baseUrl);
    await joinFlight(observer, flightId);
    const released = collect(observer, 'seat:released');
    const cancelled = waitForEvent(observer, 'flight:updated');
    const lastRelease = waitForEvent(observer, 'seat:released', (event) => event.seatId === '12D');

    const response = await patch(flightId, { status: 'CANCELLED' }).expect(200);

    expect(response.body).toMatchObject({ status: 'CANCELLED', seq: 7 });
    await expect(cancelled).resolves.toMatchObject({
      seq: 4,
      status: 'CANCELLED',
      change: 'CANCELLED',
    });
    await lastRelease;
    expect(released.map((event) => [event.seq, event.seatId, event.reason])).toEqual([
      [5, '1A', 'FLIGHT_CANCELLED'],
      [6, '12C', 'FLIGHT_CANCELLED'],
      [7, '12D', 'FLIGHT_CANCELLED'],
    ]);
    expect(await ctx.prisma.seat.count({ where: { flightId, status: 'HELD' } })).toBe(0);

    const hold = await request(ctx.app.getHttpServer())
      .post(`/api/flights/${flightId}/seats/5B/hold`)
      .set('X-Client-Id', randomUUID())
      .expect(422);
    expect(hold.body.code).toBe('FLIGHT_NOT_BOOKABLE');
    const confirm = await postBooking(
      ctx,
      holder,
      bookingBody(flightId, { '12C': 'Ana Gómez', '12D': 'Luis Pérez' }),
    ).expect(422);
    expect(confirm.body.code).toBe('FLIGHT_NOT_BOOKABLE');
  });

  it('cancelar dos veces → 422 FLIGHT_STATUS_CONFLICT; retrasar un cancelado también', async () => {
    const flightId = await ctx.createFlight();
    await patch(flightId, { status: 'CANCELLED' }).expect(200);
    const again = await patch(flightId, { status: 'CANCELLED' }).expect(422);
    expect(again.body.code).toBe('FLIGHT_STATUS_CONFLICT');
    const delay = await patch(flightId, {
      status: 'DELAYED',
      newDepartureAt: new Date(ctx.clock.now().getTime() + 48 * HOUR).toISOString(),
    }).expect(422);
    expect(delay.body.code).toBe('FLIGHT_STATUS_CONFLICT');
  });

  it('valida el cuerpo (SOLD_OUT no lo pone el admin) y el vuelo inexistente', async () => {
    const flightId = await ctx.createFlight();
    const soldOut = await patch(flightId, { status: 'SOLD_OUT' }).expect(422);
    expect(soldOut.body.code).toBe('VALIDATION_ERROR');
    await patch(flightId, { status: 'DELAYED' }).expect(422);
    const missing = await patch(randomUUID(), { status: 'CANCELLED' }).expect(404);
    expect(missing.body.code).toBe('FLIGHT_NOT_FOUND');
  });
});
