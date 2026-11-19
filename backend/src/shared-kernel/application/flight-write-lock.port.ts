/**
 * Lock de escritura del vuelo (research.md §6). Toda operación que cambia asientos o el estado
 * de un vuelo lo toma primero; el orden de locks es vuelo → advisory del cliente → asientos.
 */
export const FLIGHT_WRITE_LOCK = Symbol('FlightWriteLock');

/**
 * - `bookable`: SCHEDULED o DELAYED y aún no salió (si no, FLIGHT_NOT_BOOKABLE).
 * - `notCancelled`: cualquier estado salvo CANCELLED (si no, FLIGHT_STATUS_CONFLICT).
 * - `any`: solo serializa.
 */
export type FlightLockCondition = 'bookable' | 'notCancelled' | 'any';

export interface FlightWriteLock {
  /** Bloquea la fila del vuelo en la transacción activa y devuelve su `seq` actual. */
  acquire(flightId: string, condition: FlightLockCondition, now: Date): Promise<number>;
}
