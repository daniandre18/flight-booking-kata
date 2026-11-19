import { FlightDtoSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { holdSeats } from '../support/bookings';
import { createTestApp, type TestApp } from '../support/test-app';

/** Instante en Bogotá (UTC-5, sin horario de verano). */
const bogota = (localDateTime: string): Date => new Date(`${localDateTime}-05:00`);

describe('Búsqueda de vuelos (HU1, RF-001 a RF-005)', () => {
  let ctx: TestApp;
  const search = (query: Record<string, string>) =>
    request(ctx.app.getHttpServer()).get('/api/flights').query(query);

  beforeAll(async () => {
    // FakeClock por defecto: 2026-11-18 10:00 en Bogotá.
    ctx = await createTestApp();
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await ctx.close();
  });

  it('filtra por ruta y día de Bogotá, ordena por salida e incluye cancelados', async () => {
    const late = await ctx.createFlight({ departureAt: bogota('2026-11-19T23:30:00') });
    const early = await ctx.createFlight({ departureAt: bogota('2026-11-19T00:00:00') });
    const cancelled = await ctx.createFlight({
      departureAt: bogota('2026-11-19T12:00:00'),
      status: 'CANCELLED',
    });
    await ctx.createFlight({ departureAt: bogota('2026-11-20T00:00:00') }); // otro día
    await ctx.createFlight({ departureAt: bogota('2026-11-18T23:59:00') }); // día anterior
    await ctx.createFlight({ departureAt: bogota('2026-11-19T09:00:00'), destination: 'CLO' });
    await ctx.createFlight({
      departureAt: bogota('2026-11-19T09:00:00'),
      origin: 'MDE',
      destination: 'BOG',
    });

    const response = await search({ origin: 'BOG', destination: 'MDE', date: '2026-11-19' }).expect(
      200,
    );

    const flights = FlightDtoSchema.array().parse(response.body);
    expect(flights.map((flight) => flight.id)).toEqual([early, cancelled, late]);
    expect(flights[1]).toMatchObject({ status: 'CANCELLED' });
    expect(flights[0]).toMatchObject({
      origin: 'BOG',
      destination: 'MDE',
      durationMinutes: 60,
      fare: 250_000,
      availableSeats: 180,
      capacity: 180,
      delayed: false,
      seq: 0,
    });
  });

  it('availableSeats usa la vista perezosa: un bloqueo vencido cuenta como disponible', async () => {
    const flightId = await ctx.createFlight({ departureAt: bogota('2026-11-19T08:00:00') });
    await holdSeats(ctx, flightId, randomUUID(), ['1A', '1B']);
    const query = { origin: 'BOG', destination: 'MDE', date: '2026-11-19' };
    const held = await search(query).expect(200);
    expect(held.body[0]).toMatchObject({ availableSeats: 178, seq: 2 });
    ctx.clock.advance(600_000);
    const expired = await search(query).expect(200);
    expect(expired.body[0]).toMatchObject({ availableSeats: 180 });
  });

  it('valida la consulta: fecha pasada, origen = destino o campos faltantes → 422', async () => {
    const past = await search({ origin: 'BOG', destination: 'MDE', date: '2026-11-17' }).expect(
      422,
    );
    expect(past.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'date', message: 'La fecha no puede ser pasada' }],
    });
    const same = await search({ origin: 'BOG', destination: 'BOG', date: '2026-11-19' }).expect(
      422,
    );
    expect(same.body.details).toEqual([
      { path: 'destination', message: 'El destino debe ser distinto del origen' },
    ]);
    await search({ origin: 'BOG' }).expect(422);
    await search({ origin: 'XXX', destination: 'MDE', date: '2026-11-19' }).expect(422);
    // Hoy en Bogotá sí es válido.
    await search({ origin: 'BOG', destination: 'MDE', date: '2026-11-18' }).expect(200);
  });

  it('sin resultados responde una lista vacía', async () => {
    const response = await search({ origin: 'CTG', destination: 'BAQ', date: '2026-11-21' }).expect(
      200,
    );
    expect(response.body).toEqual([]);
  });

  it('un retraso que cambia de día mueve el vuelo a la nueva fecha', async () => {
    const flightId = await ctx.createFlight({ departureAt: bogota('2026-11-19T22:00:00') });
    const newDeparture = bogota('2026-11-20T01:30:00');
    await ctx.prisma.flight.update({
      where: { id: flightId },
      data: {
        status: 'DELAYED',
        departureAt: newDeparture,
        arrivalAt: new Date(newDeparture.getTime() + 3_600_000),
      },
    });
    const before = await search({ origin: 'BOG', destination: 'MDE', date: '2026-11-19' }).expect(
      200,
    );
    expect(before.body).toEqual([]);
    const after = await search({ origin: 'BOG', destination: 'MDE', date: '2026-11-20' }).expect(
      200,
    );
    expect(after.body).toEqual([
      expect.objectContaining({ id: flightId, status: 'DELAYED', delayed: true }),
    ]);
  });

  it('GET /api/flights/:id incluye seq; inexistente → 404 y id inválido → 422', async () => {
    const flightId = await ctx.createFlight();
    await holdSeats(ctx, flightId, randomUUID(), ['3C']);
    const response = await request(ctx.app.getHttpServer())
      .get(`/api/flights/${flightId}`)
      .expect(200);
    expect(FlightDtoSchema.parse(response.body)).toMatchObject({
      id: flightId,
      seq: 1,
      availableSeats: 179,
    });
    const missing = await request(ctx.app.getHttpServer())
      .get(`/api/flights/${randomUUID()}`)
      .expect(404);
    expect(missing.body.code).toBe('FLIGHT_NOT_FOUND');
    await request(ctx.app.getHttpServer()).get('/api/flights/no-es-uuid').expect(422);
  });
});
