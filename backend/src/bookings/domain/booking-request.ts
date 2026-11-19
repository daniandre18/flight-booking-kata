import { createHash } from 'node:crypto';
import { lastFourDigits, type CreateBookingRequest } from '@kata/shared';
import { DomainError } from '../../shared-kernel/domain/domain-error';

/** El correo se guarda y se compara en minúsculas (consulta sin distinguir mayúsculas). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Total = tarifa × asientos (RF-016; tarifa única por vuelo). */
export function bookingTotal(fare: number, seatCount: number): number {
  return fare * seatCount;
}

/**
 * Huella de la solicitud normalizada para la idempotencia (research.md §10). De la tarjeta solo
 * entran los últimos 4 dígitos y el vencimiento: el SHA-256 de un número de 16 dígitos se puede
 * revertir por fuerza bruta, así que ni el número ni el CVV se usan (principio X).
 */
export function bookingRequestHash(request: CreateBookingRequest): string {
  const canonical = {
    flightId: request.flightId.toLowerCase(),
    buyer: { name: request.buyer.name.trim(), email: normalizeEmail(request.buyer.email) },
    passengers: request.passengers
      .map((passenger) => ({ seatId: passenger.seatId, name: passenger.name.trim() }))
      .sort((a, b) => a.seatId.localeCompare(b.seatId)),
    card: { last4: lastFourDigits(request.card.number), expiry: request.card.expiry },
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** La misma clave solo puede repetir la misma solicitud. */
export function assertSameRequest(storedHash: string, requestHash: string): void {
  if (storedHash !== requestHash) {
    throw new DomainError(
      'IDEMPOTENCY_KEY_REUSED',
      'Esta clave de idempotencia ya se usó con otra solicitud',
    );
  }
}
