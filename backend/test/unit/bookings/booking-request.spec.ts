import type { CreateBookingRequest } from '@kata/shared';
import {
  assertSameRequest,
  bookingRequestHash,
  bookingTotal,
  normalizeEmail,
} from '../../../src/bookings/domain/booking-request';

const REQUEST: CreateBookingRequest = {
  flightId: '5B0C6F1E-0D3A-4F7E-9C41-2A8E1F0B7D10',
  buyer: { name: 'Ana Gómez', email: 'Ana@Correo.co' },
  passengers: [
    { seatId: '12D', name: 'Luis Pérez' },
    { seatId: '12C', name: 'Ana Gómez' },
  ],
  card: { number: '4111111111111111', expiry: '12/30', cvv: '123' },
};

describe('solicitud de reserva', () => {
  it('normaliza el correo a minúsculas', () => {
    expect(normalizeEmail('  Ana@Correo.CO ')).toBe('ana@correo.co');
  });

  it('calcula el total como tarifa × asientos', () => {
    expect(bookingTotal(210_000, 3)).toBe(630_000);
  });

  it('la huella no depende del orden de pasajeros ni de mayúsculas del correo o del vuelo', () => {
    const reordered: CreateBookingRequest = {
      ...REQUEST,
      flightId: REQUEST.flightId.toLowerCase(),
      buyer: { ...REQUEST.buyer, email: 'ana@correo.co' },
      passengers: [...REQUEST.passengers].reverse(),
    };
    expect(bookingRequestHash(reordered)).toBe(bookingRequestHash(REQUEST));
  });

  it('la huella cambia si cambia el contenido', () => {
    const other = { ...REQUEST, buyer: { ...REQUEST.buyer, name: 'Otra Persona' } };
    expect(bookingRequestHash(other)).not.toBe(bookingRequestHash(REQUEST));
  });

  it('no usa el número completo ni el CVV de la tarjeta (principio X)', () => {
    const sameLast4 = {
      ...REQUEST,
      card: { number: '5555555555551111', expiry: '12/30', cvv: '999' },
    };
    const hash = bookingRequestHash(REQUEST);
    expect(bookingRequestHash(sameLast4)).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('la misma clave con otra solicitud da IDEMPOTENCY_KEY_REUSED', () => {
    expect(() => assertSameRequest('a', 'a')).not.toThrow();
    expect(() => assertSameRequest('a', 'b')).toThrow(
      expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }),
    );
  });
});
