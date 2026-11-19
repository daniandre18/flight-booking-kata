import { BookingDtoSchema, DECLINED_TEST_CARD } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import { bookingBody, holdSeats, postBooking, VISA_CARD } from '../support/bookings';
import { createTestApp, type TestApp } from '../support/test-app';

describe('Confirmación de la reserva (HU3)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await ctx.close();
  });

  const seat = (flightId: string, code: string) =>
    ctx.prisma.seat.findFirstOrThrow({
      where: { flightId, row: Number(code.slice(0, -1)), letter: code.slice(-1) },
    });

  it('confirma: 201, asientos BOOKED, código, total y solo marca y últimos 4 en la base', async () => {
    const flightId = await ctx.createFlight({ fare: 210_000 });
    const clientId = randomUUID();
    await holdSeats(ctx, flightId, clientId, ['12C', '12D']);
    const body = bookingBody(flightId, { '12C': 'Ana Gómez', '12D': 'Luis Pérez' });
    const response = await postBooking(ctx, clientId, body).expect(201);

    const dto = BookingDtoSchema.parse(response.body);
    expect(dto.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(dto).toMatchObject({
      total: 420_000,
      cardBrand: 'VISA',
      cardLast4: '1111',
      buyer: { name: 'Ana Gómez', email: 'ana.gomez@correo.co' },
      passengers: [
        { seatId: '12C', name: 'Ana Gómez', type: 'AISLE' },
        { seatId: '12D', name: 'Luis Pérez', type: 'AISLE' },
      ],
      flight: { id: flightId, availableSeats: 178 },
    });
    expect(await seat(flightId, '12C')).toMatchObject({ status: 'BOOKED', heldBy: null });
    expect(await seat(flightId, '12D')).toMatchObject({ status: 'BOOKED', holdExpiresAt: null });

    const stored = await ctx.prisma.booking.findFirstOrThrow({ where: { code: dto.code } });
    expect(stored).toMatchObject({ cardBrand: 'VISA', cardLast4: '1111', total: 420_000 });
    const dump = await ctx.prisma.$queryRaw<{ json: string }[]>`
      SELECT row_to_json(b)::text AS json FROM bookings b
      UNION ALL SELECT row_to_json(k)::text FROM idempotency_keys k
      UNION ALL SELECT row_to_json(e)::text FROM flight_events e`;
    expect(dump.map((row) => row.json).join('\n')).not.toContain(VISA_CARD.number);

    const events = await ctx.prisma.flightEvent.findMany({
      where: { flightId },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((event) => [event.type, Number(event.seq), event.seatCode])).toEqual([
      ['SEAT_HELD', 1, '12C'],
      ['SEAT_HELD', 2, '12D'],
      ['SEAT_BOOKED', 3, '12C'],
      ['SEAT_BOOKED', 4, '12D'],
    ]);
  });

  it('con el bloqueo vencido responde 410 HOLD_EXPIRED y no crea la reserva', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    await holdSeats(ctx, flightId, clientId, ['12C']);
    ctx.clock.advance(601_000);
    const response = await postBooking(
      ctx,
      clientId,
      bookingBody(flightId, { '12C': 'Ana Gómez' }),
    ).expect(410);
    expect(response.body.code).toBe('HOLD_EXPIRED');
    expect(await ctx.prisma.booking.count()).toBe(0);
  });

  it('con la tarjeta de prueba responde 402 PAYMENT_DECLINED y conserva los bloqueos', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    await holdSeats(ctx, flightId, clientId, ['12C']);
    const before = await seat(flightId, '12C');
    const body = bookingBody(
      flightId,
      { '12C': 'Ana Gómez' },
      { card: { ...VISA_CARD, number: DECLINED_TEST_CARD } },
    );
    const response = await postBooking(ctx, clientId, body).expect(402);
    expect(response.body.code).toBe('PAYMENT_DECLINED');
    expect(await seat(flightId, '12C')).toEqual(before);
    expect(await ctx.prisma.booking.count()).toBe(0);
    expect(await ctx.prisma.idempotencyKey.count()).toBe(0);
  });

  it('si los pasajeros no cubren todos los bloqueos responde 422 PASSENGERS_MISMATCH', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    await holdSeats(ctx, flightId, clientId, ['12C', '12D']);
    const response = await postBooking(
      ctx,
      clientId,
      bookingBody(flightId, { '12C': 'Ana Gómez' }),
    ).expect(422);
    expect(response.body.code).toBe('PASSENGERS_MISMATCH');
    expect(await seat(flightId, '12C')).toMatchObject({ status: 'HELD', heldBy: clientId });
  });

  it('un vuelo cancelado responde 422 FLIGHT_NOT_BOOKABLE', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    await holdSeats(ctx, flightId, clientId, ['12C']);
    await ctx.prisma.flight.update({ where: { id: flightId }, data: { status: 'CANCELLED' } });
    const response = await postBooking(
      ctx,
      clientId,
      bookingBody(flightId, { '12C': 'Ana Gómez' }),
    ).expect(422);
    expect(response.body.code).toBe('FLIGHT_NOT_BOOKABLE');
  });

  it('reservar el último asiento deja el vuelo SOLD_OUT y registra flight:updated', async () => {
    const flightId = await ctx.createFlight();
    await ctx.prisma.seat.updateMany({
      where: { flightId, NOT: { row: 30, letter: 'F' } },
      data: { status: 'BOOKED' },
    });
    const clientId = randomUUID();
    await holdSeats(ctx, flightId, clientId, ['30F']);
    const response = await postBooking(
      ctx,
      clientId,
      bookingBody(flightId, { '30F': 'Ana Gómez' }),
    ).expect(201);
    expect(response.body.flight).toMatchObject({ status: 'SOLD_OUT', availableSeats: 0 });
    const flight = await ctx.prisma.flight.findUniqueOrThrow({ where: { id: flightId } });
    expect(flight.status).toBe('SOLD_OUT');
    const last = await ctx.prisma.flightEvent.findFirstOrThrow({
      where: { flightId },
      orderBy: { seq: 'desc' },
    });
    expect(last).toMatchObject({ type: 'FLIGHT_UPDATED', seatCode: null });
    expect(last.payload).toMatchObject({ status: 'SOLD_OUT', change: 'SOLD_OUT' });
  });

  it('valida el cuerpo (422 VALIDATION_ERROR) y exige X-Client-Id (400)', async () => {
    const flightId = await ctx.createFlight();
    const invalid = await postBooking(ctx, randomUUID(), {
      ...bookingBody(flightId, {}),
      passengers: [],
    }).expect(422);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    const anonymous = await postBooking(
      ctx,
      'no-es-uuid',
      bookingBody(flightId, { '12C': 'Ana Gómez' }),
    ).expect(400);
    expect(anonymous.body.code).toBe('CLIENT_ID_REQUIRED');
  });
});
