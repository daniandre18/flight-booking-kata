import { DECLINED_TEST_CARD } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import { bookingBody, holdSeats, postBooking, VISA_CARD } from '../support/bookings';
import { createTestApp, type TestApp } from '../support/test-app';

describe('Idempotencia de la confirmación (RF-020, CE-007)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await ctx.close();
  });

  async function heldFlight(clientId: string): Promise<string> {
    const flightId = await ctx.createFlight();
    await holdSeats(ctx, flightId, clientId, ['12C', '12D']);
    return flightId;
  }

  const seatsOf = { '12C': 'Ana Gómez', '12D': 'Luis Pérez' };

  it('la misma clave dos veces: 201 y luego 200 con Idempotent-Replayed y el mismo código', async () => {
    const clientId = randomUUID();
    const flightId = await heldFlight(clientId);
    const key = randomUUID();
    const body = bookingBody(flightId, seatsOf);
    const first = await postBooking(ctx, clientId, body, key).expect(201);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    const second = await postBooking(ctx, clientId, body, key).expect(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await ctx.prisma.booking.count()).toBe(1);
  });

  it('dos envíos concurrentes con la misma clave producen una sola reserva', async () => {
    const clientId = randomUUID();
    const flightId = await heldFlight(clientId);
    const key = randomUUID();
    const body = bookingBody(flightId, seatsOf);
    const responses = await Promise.all([
      postBooking(ctx, clientId, body, key),
      postBooking(ctx, clientId, body, key),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0]?.body.code).toBe(responses[1]?.body.code);
    expect(await ctx.prisma.booking.count()).toBe(1);
  });

  it('la misma clave con otro cuerpo responde 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const clientId = randomUUID();
    const flightId = await heldFlight(clientId);
    const key = randomUUID();
    await postBooking(ctx, clientId, bookingBody(flightId, seatsOf), key).expect(201);
    const other = bookingBody(flightId, seatsOf, {
      buyer: { name: 'Otra Persona', email: 'otra@correo.co' },
    });
    const response = await postBooking(ctx, clientId, other, key).expect(422);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('tras un pago rechazado la clave no queda guardada y el reintento se procesa', async () => {
    const clientId = randomUUID();
    const flightId = await heldFlight(clientId);
    const key = randomUUID();
    const declined = bookingBody(flightId, seatsOf, {
      card: { ...VISA_CARD, number: DECLINED_TEST_CARD },
    });
    await postBooking(ctx, clientId, declined, key).expect(402);
    await postBooking(ctx, clientId, bookingBody(flightId, seatsOf), key).expect(201);
  });

  it.each([
    ['sin Idempotency-Key', null],
    ['con una clave que no es UUID', 'clave-123'],
  ])('%s responde 400 IDEMPOTENCY_KEY_REQUIRED', async (_case, key) => {
    const clientId = randomUUID();
    const flightId = await heldFlight(clientId);
    const response = await postBooking(ctx, clientId, bookingBody(flightId, seatsOf), key).expect(
      400,
    );
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await ctx.prisma.booking.count()).toBe(0);
  });
});
