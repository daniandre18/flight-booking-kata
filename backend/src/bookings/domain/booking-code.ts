import { randomInt } from 'node:crypto';

/** Código de reserva (data-model.md `bookings.code`): 6 caracteres de `A-Z0-9`, único. */
export const BOOKING_CODE_LENGTH = 6;
export const BOOKING_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Entero aleatorio en `[0, max)`. Por defecto criptográfico: el código protege el boleto. */
export type RandomIndex = (max: number) => number;

export function generateBookingCode(randomIndex: RandomIndex = randomInt): string {
  let code = '';
  for (let position = 0; position < BOOKING_CODE_LENGTH; position += 1) {
    code += BOOKING_CODE_ALPHABET.charAt(randomIndex(BOOKING_CODE_ALPHABET.length));
  }
  return code;
}

/** El código se compara sin distinguir mayúsculas ni espacios alrededor. */
export function normalizeBookingCode(code: string): string {
  return code.trim().toUpperCase();
}
