import { Injectable } from '@nestjs/common';
import { formatSeatCode, type SeatLetter, type SeatStatus } from '@kata/shared';
import { holderTagOf } from '../../../shared-kernel/domain/holder-tag';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import { isUuid } from '../../../shared-kernel/infrastructure/persistence/uuid';
import {
  type ClientHoldGroup,
  type SeatQueryPort,
  type SeatView,
} from '../../application/ports/seat-query.port';
import { isHoldExpired } from '../../domain/hold-policy';

interface SeatRecord {
  flightId: string;
  row: number;
  letter: string;
  status: SeatStatus;
  heldBy: string | null;
  holdExpiresAt: Date | null;
}

/** Lecturas de asientos con vista perezosa; nunca exponen el `clientId` (solo `holderTag`). */
@Injectable()
export class PrismaSeatQueryAdapter implements SeatQueryPort {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async getSeats(flightId: string, now: Date): Promise<SeatView[]> {
    if (!isUuid(flightId)) {
      return [];
    }
    const seats = await this.uow.currentTx().seat.findMany({
      where: { flightId },
      orderBy: [{ row: 'asc' }, { letter: 'asc' }],
    });
    return seats.map((seat) => toSeatView(seat, now));
  }

  async getClientHolds(clientId: string, now: Date): Promise<ClientHoldGroup[]> {
    const seats = await this.uow.currentTx().seat.findMany({
      where: { heldBy: clientId, status: 'HELD', holdExpiresAt: { gt: now } },
      orderBy: [{ flightId: 'asc' }, { row: 'asc' }, { letter: 'asc' }],
    });
    return groupByFlight(seats);
  }
}

function toSeatView(seat: SeatRecord, now: Date): SeatView {
  const letter = seat.letter as SeatLetter;
  const expired = seat.holdExpiresAt !== null && isHoldExpired(seat.holdExpiresAt, now);
  if (seat.status === 'HELD' && expired) {
    return { row: seat.row, letter, status: 'AVAILABLE', holderTag: null, holdExpiresAt: null };
  }
  return {
    row: seat.row,
    letter,
    status: seat.status,
    holderTag: seat.heldBy === null ? null : holderTagOf(seat.heldBy),
    holdExpiresAt: seat.holdExpiresAt,
  };
}

function groupByFlight(seats: SeatRecord[]): ClientHoldGroup[] {
  const groups = new Map<string, ClientHoldGroup>();
  for (const seat of seats) {
    const group = groups.get(seat.flightId) ?? {
      flightId: seat.flightId,
      seatCodes: [],
      holdExpiresAt: seat.holdExpiresAt as Date,
    };
    group.seatCodes.push(formatSeatCode(seat.row, seat.letter as SeatLetter));
    groups.set(seat.flightId, group);
  }
  return [...groups.values()];
}
