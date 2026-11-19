/**
 * Claves de idempotencia de la confirmación (research.md §10; data-model.md `idempotency_keys`).
 * La clave se inserta en la misma transacción de la reserva: si esa transacción falla, la clave
 * no queda guardada y el reintento se procesa de nuevo.
 */
export const IDEMPOTENCY_STORE = Symbol('IdempotencyStore');

export interface IdempotencyKeyRef {
  clientId: string;
  key: string;
}

export type ReserveKeyResult =
  | { status: 'reserved' }
  /** Ya existe una confirmación guardada con esa clave: su huella y su reserva. */
  | { status: 'existing'; requestHash: string; bookingId: string };

export interface IdempotencyStore {
  /** Si otra transacción usa la misma clave, espera a que termine (índice único). */
  reserve(ref: IdempotencyKeyRef & { requestHash: string }): Promise<ReserveKeyResult>;
  attach(ref: IdempotencyKeyRef, bookingId: string): Promise<void>;
}
