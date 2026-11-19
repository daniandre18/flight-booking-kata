import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import {
  type ClientHoldSummary,
  type SeatHoldTarget,
  type SeatHoldsPort,
} from '../../application/ports/seat-holds.port';

interface SummaryRow {
  active: number;
  shared_expires_at: Date | null;
}

/**
 * Primitivas atómicas de bloqueo sobre la tabla `seats` (research.md §5–§7). Cada transición es
 * un UPDATE condicional cuyo conteo decide: nunca SELECT y luego UPDATE (principio I).
 */
@Injectable()
export class PrismaSeatHoldsAdapter implements SeatHoldsPort {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async lockClientHolds(flightId: string, clientId: string, now: Date): Promise<ClientHoldSummary> {
    const tx = this.uow.requireTx();
    await tx.$queryRaw`
      SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${clientId}), hashtext(${flightId}))`;
    const rows = await tx.$queryRaw<SummaryRow[]>`
      SELECT COUNT(*)::int AS active, MIN(hold_expires_at) AS shared_expires_at
      FROM seats
      WHERE flight_id = ${flightId}::uuid AND held_by = ${clientId}::uuid
        AND status = 'HELD' AND hold_expires_at > ${now}`;
    const row = rows[0];
    return { activeCount: row?.active ?? 0, sharedExpiresAt: row?.shared_expires_at ?? null };
  }

  async holdIfAvailable(target: SeatHoldTarget & { expiresAt: Date }): Promise<boolean> {
    const { count } = await this.uow.requireTx().seat.updateMany({
      where: {
        flightId: target.flightId,
        row: target.seat.row,
        letter: target.seat.letter,
        OR: [{ status: 'AVAILABLE' }, { status: 'HELD', holdExpiresAt: { lt: target.now } }],
      },
      data: {
        status: 'HELD',
        heldBy: target.clientId,
        holdExpiresAt: target.expiresAt,
        version: { increment: 1 },
      },
    });
    return count === 1;
  }

  async releaseIfOwned(target: SeatHoldTarget): Promise<boolean> {
    const { count } = await this.uow.requireTx().seat.updateMany({
      where: {
        flightId: target.flightId,
        row: target.seat.row,
        letter: target.seat.letter,
        status: 'HELD',
        heldBy: target.clientId,
        holdExpiresAt: { gt: target.now },
      },
      data: { status: 'AVAILABLE', heldBy: null, holdExpiresAt: null, version: { increment: 1 } },
    });
    return count === 1;
  }
}
