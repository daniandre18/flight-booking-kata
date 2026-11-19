import { DomainError } from '../../shared-kernel/domain/domain-error';

/** Reglas del bloqueo (spec RF-008, RF-010; Clarifications: reloj compartido). */
export const MAX_HOLDS_PER_FLIGHT = 4;

/** Un bloqueo vencido cuenta como disponible (vista perezosa). */
export function isHoldExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * Vencimiento compartido: si el cliente ya tiene bloqueos vigentes en el vuelo, el asiento nuevo
 * hereda su vencimiento (sumar asientos nunca extiende el plazo); si no, `now + ttl`.
 */
export function computeHoldExpiry(
  sharedExpiresAt: Date | null,
  now: Date,
  ttlSeconds: number,
): Date {
  if (sharedExpiresAt !== null && !isHoldExpired(sharedExpiresAt, now)) {
    return sharedExpiresAt;
  }
  return new Date(now.getTime() + ttlSeconds * 1_000);
}

export function assertCanHoldMore(activeHolds: number): void {
  if (activeHolds >= MAX_HOLDS_PER_FLIGHT) {
    throw new DomainError(
      'HOLD_LIMIT_REACHED',
      `Ya tienes ${MAX_HOLDS_PER_FLIGHT} asientos bloqueados en este vuelo`,
      { max: MAX_HOLDS_PER_FLIGHT },
    );
  }
}
