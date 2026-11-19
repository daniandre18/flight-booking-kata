import { Injectable } from '@nestjs/common';
import type { SeatLetter } from '@kata/shared';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import {
  type MarkBookedRequest,
  type MarkBookedResult,
  type SeatBookingPort,
} from '../../application/ports/seat-booking.port';

interface BookedRow {
  id: string;
  row: number;
  letter: SeatLetter;
}

/**
 * HELD → BOOKED con un solo UPDATE condicional `RETURNING` (data-model.md T6): solo pasan los
 * bloqueos vigentes del cliente; el caso de uso compara el conteo con la solicitud.
 */
@Injectable()
export class PrismaSeatBookingAdapter implements SeatBookingPort {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async markBooked(request: MarkBookedRequest): Promise<MarkBookedResult> {
    const tx = this.uow.requireTx();
    const { flightId, clientId, now } = request;
    const booked =
      request.seats.length === 0
        ? []
        : await tx.$queryRaw<BookedRow[]>`
          UPDATE seats
          SET status = 'BOOKED', held_by = NULL, hold_expires_at = NULL, version = version + 1
          WHERE flight_id = ${flightId}::uuid AND status = 'HELD' AND held_by = ${clientId}::uuid
            AND hold_expires_at > ${now}
            AND (row, letter) IN (${Prisma.join(
              request.seats.map(
                (seat) => Prisma.sql`(${seat.row}::smallint, ${seat.letter}::char(1))`,
              ),
            )})
          RETURNING id, row::int AS row, letter`;
    const remaining = await tx.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM seats
      WHERE flight_id = ${flightId}::uuid AND status = 'HELD' AND held_by = ${clientId}::uuid
        AND hold_expires_at > ${now}`;
    return { booked, remainingActiveHolds: remaining[0]?.count ?? 0 };
  }
}
