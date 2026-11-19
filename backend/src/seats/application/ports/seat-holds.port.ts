import type { SeatPosition } from '@kata/shared';

/**
 * Escritura de bloqueos (I de SOLID). Primitivas atómicas que se ejecutan dentro de la
 * UnitOfWork del caso de uso; las reglas (límite, reloj compartido) las aplica el caso de uso.
 */
export const SEAT_HOLDS_PORT = Symbol('SeatHoldsPort');

export interface ClientHoldSummary {
  /** Bloqueos vigentes del cliente en el vuelo. */
  activeCount: number;
  /** Vencimiento común de esos bloqueos; `null` si no tiene. */
  sharedExpiresAt: Date | null;
}

export interface SeatHoldTarget {
  flightId: string;
  seat: SeatPosition;
  clientId: string;
  now: Date;
}

export interface SeatHoldsPort {
  /** Serializa al cliente en el vuelo (advisory lock) y resume sus bloqueos vigentes. */
  lockClientHolds(flightId: string, clientId: string, now: Date): Promise<ClientHoldSummary>;
  /** UPDATE condicional: disponible o bloqueo vencido → HELD. `true` si ganó el asiento. */
  holdIfAvailable(target: SeatHoldTarget & { expiresAt: Date }): Promise<boolean>;
  /** UPDATE condicional: bloqueo vigente del cliente → AVAILABLE. `true` si lo liberó. */
  releaseIfOwned(target: SeatHoldTarget): Promise<boolean>;
}
