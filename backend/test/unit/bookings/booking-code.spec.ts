import {
  BOOKING_CODE_ALPHABET,
  BOOKING_CODE_LENGTH,
  generateBookingCode,
  normalizeBookingCode,
} from '../../../src/bookings/domain/booking-code';

describe('código de reserva', () => {
  it('tiene 6 caracteres de A-Z0-9 con el generador criptográfico por defecto', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generateBookingCode()).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('usa la fuente aleatoria inyectada para cada posición', () => {
    const indexes = [0, 25, 26, 35, 1, 2];
    const calls: number[] = [];
    const code = generateBookingCode((max) => {
      calls.push(max);
      return indexes[calls.length - 1] ?? 0;
    });
    expect(code).toBe('AZ09BC');
    expect(calls).toEqual(Array(BOOKING_CODE_LENGTH).fill(BOOKING_CODE_ALPHABET.length));
  });

  it('genera códigos distintos (aleatorios, no secuenciales)', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateBookingCode()));
    expect(codes.size).toBeGreaterThan(495);
  });

  it('normaliza a mayúsculas sin espacios alrededor', () => {
    expect(normalizeBookingCode('  ab12cd ')).toBe('AB12CD');
  });
});
