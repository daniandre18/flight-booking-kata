import { Injectable } from '@nestjs/common';
import { formatSeatCode, type SeatLetter } from '@kata/shared';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import { type SeatReleasePort } from '../../application/ports/seat-release.port';

interface ReleasedRow {
  row: number;
  letter: SeatLetter;
}

/**
 * Liberación masiva con UPDATE condicional `RETURNING` (research.md §11 y §14). El índice parcial
 * `seats_hold_expires_at_held_idx` hace barata la búsqueda de vencidos cada 2 s.
 */
@Injectable()
export class PrismaSeatReleaseAdapter implements SeatReleasePort {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async findFlightsWithExpiredHolds(now: Date): Promise<string[]> {
    const rows = await this.uow.currentTx().$queryRaw<{ flight_id: string }[]>`
      SELECT DISTINCT flight_id FROM seats WHERE status = 'HELD' AND hold_expires_at <= ${now}`;
    return rows.map((row) => row.flight_id);
  }

  async releaseExpired(flightId: string, now: Date): Promise<string[]> {
    const rows = await this.uow.requireTx().$queryRaw<ReleasedRow[]>`
      UPDATE seats
      SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, version = version + 1
      WHERE flight_id = ${flightId}::uuid AND status = 'HELD' AND hold_expires_at <= ${now}
      RETURNING row::int AS row, letter`;
    return toSortedCodes(rows);
  }

  async releaseAllHeld(flightId: string): Promise<string[]> {
    const rows = await this.uow.requireTx().$queryRaw<ReleasedRow[]>`
      UPDATE seats
      SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, version = version + 1
      WHERE flight_id = ${flightId}::uuid AND status = 'HELD'
      RETURNING row::int AS row, letter`;
    return toSortedCodes(rows);
  }
}

/** Orden estable (fila, letra) para que los eventos tengan `seq` deterministas. */
function toSortedCodes(rows: ReleasedRow[]): string[] {
  return [...rows]
    .sort((a, b) => a.row - b.row || a.letter.localeCompare(b.letter))
    .map((row) => formatSeatCode(row.row, row.letter));
}
