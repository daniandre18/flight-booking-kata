import type { CreateBookingRequest } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { TestApp } from './test-app';

export const VISA_CARD = { number: '4111111111111111', expiry: '12/30', cvv: '123' };

/** Cuerpo válido de `POST /api/bookings`: un pasajero por asiento. */
export function bookingBody(
  flightId: string,
  seats: Record<string, string>,
  overrides: Partial<CreateBookingRequest> = {},
): CreateBookingRequest {
  return {
    flightId,
    buyer: { name: 'Ana Gómez', email: 'Ana.Gomez@Correo.co' },
    passengers: Object.entries(seats).map(([seatId, name]) => ({ seatId, name })),
    card: VISA_CARD,
    ...overrides,
  };
}

export async function holdSeats(
  ctx: TestApp,
  flightId: string,
  clientId: string,
  seatIds: string[],
): Promise<void> {
  for (const seatId of seatIds) {
    await request(ctx.app.getHttpServer())
      .post(`/api/flights/${flightId}/seats/${seatId}/hold`)
      .set('X-Client-Id', clientId)
      .expect(201);
  }
}

export function postBooking(
  ctx: TestApp,
  clientId: string,
  body: unknown,
  idempotencyKey: string | null = randomUUID(),
): request.Test {
  const call = request(ctx.app.getHttpServer()).post('/api/bookings').set('X-Client-Id', clientId);
  return (idempotencyKey === null ? call : call.set('Idempotency-Key', idempotencyKey)).send(
    body as object,
  );
}
