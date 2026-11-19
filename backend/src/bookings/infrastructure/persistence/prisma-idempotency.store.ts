import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import type {
  IdempotencyKeyRef,
  IdempotencyStore,
  ReserveKeyResult,
} from '../../application/ports/idempotency-store.port';

/**
 * `INSERT ... ON CONFLICT DO NOTHING` (research.md §10): un duplicado concurrente espera en el
 * índice único `(client_id, key)` hasta que la primera transacción termina, sin abortar la
 * propia. Si la primera hizo commit, se lee lo guardado; si hizo rollback, se inserta.
 */
@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async reserve(ref: IdempotencyKeyRef & { requestHash: string }): Promise<ReserveKeyResult> {
    const tx = this.uow.requireTx();
    const inserted = await tx.$queryRaw<{ inserted: number }[]>`
      INSERT INTO idempotency_keys (client_id, key, request_hash)
      VALUES (${ref.clientId}::uuid, ${ref.key}::uuid, ${ref.requestHash})
      ON CONFLICT (client_id, key) DO NOTHING
      RETURNING 1 AS inserted`;
    if (inserted.length > 0) {
      return { status: 'reserved' };
    }
    const stored = await tx.idempotencyKey.findUnique({
      where: { clientId_key: { clientId: ref.clientId, key: ref.key } },
    });
    if (stored?.bookingId == null) {
      // Imposible tras el commit (data-model.md): la clave y su reserva se guardan juntas.
      throw new Error('Clave de idempotencia sin reserva asociada');
    }
    return { status: 'existing', requestHash: stored.requestHash, bookingId: stored.bookingId };
  }

  async attach(ref: IdempotencyKeyRef, bookingId: string): Promise<void> {
    await this.uow.requireTx().idempotencyKey.update({
      where: { clientId_key: { clientId: ref.clientId, key: ref.key } },
      data: { bookingId },
    });
  }
}
