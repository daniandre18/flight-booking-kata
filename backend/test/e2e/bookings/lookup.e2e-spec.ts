import { BookingDtoSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { bookingBody, holdSeats, postBooking } from '../support/bookings';
import { createTestApp, type TestApp } from '../support/test-app';

describe('Consulta del boleto (HU3, RF-021)', () => {
  let ctx: TestApp;
  let code: string;

  const lookup = (body: object) =>
    request(ctx.app.getHttpServer()).post('/api/bookings/lookup').send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    await holdSeats(ctx, flightId, clientId, ['1A']);
    const created = await postBooking(
      ctx,
      clientId,
      bookingBody(flightId, { '1A': 'Ana Gómez' }),
    ).expect(201);
    code = created.body.code as string;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('con código y correo correctos responde 200 (sin distinguir mayúsculas)', async () => {
    const response = await lookup({
      code: code.toLowerCase(),
      email: 'ANA.GOMEZ@correo.CO',
    }).expect(200);
    const dto = BookingDtoSchema.parse(response.body);
    expect(dto).toMatchObject({
      code,
      cardBrand: 'VISA',
      cardLast4: '1111',
      passengers: [{ seatId: '1A', name: 'Ana Gómez', type: 'WINDOW' }],
    });
  });

  it('un correo incorrecto y un código inexistente responden el mismo 404', async () => {
    const wrongEmail = await lookup({ code, email: 'otra@correo.co' }).expect(404);
    const unknownCode = await lookup({
      code: code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ',
      email: 'ana.gomez@correo.co',
    }).expect(404);
    expect(wrongEmail.body).toEqual(unknownCode.body);
    expect(wrongEmail.body.code).toBe('BOOKING_NOT_FOUND');
  });

  it('un código mal formado responde 422 VALIDATION_ERROR', async () => {
    const response = await lookup({ code: 'AB-1', email: 'ana.gomez@correo.co' }).expect(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
