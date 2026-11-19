import { allSeatPositions, formatSeatCode, type SeatStatus } from '@kata/shared';
import type {
  BookedSeat,
  MarkBookedRequest,
  MarkBookedResult,
  SeatBookingPort,
} from '../../src/seats/application/ports/seat-booking.port';
import type {
  ClientHoldSummary,
  SeatHoldTarget,
  SeatHoldsPort,
} from '../../src/seats/application/ports/seat-holds.port';
import type {
  ClientHoldGroup,
  SeatQueryPort,
  SeatView,
} from '../../src/seats/application/ports/seat-query.port';
import type { SeatReleasePort } from '../../src/seats/application/ports/seat-release.port';
import { isHoldExpired } from '../../src/seats/domain/hold-policy';
import { holderTagOf } from '../../src/shared-kernel/domain/holder-tag';
import type { Transactional } from './shared-kernel.doubles';

interface StoredSeat {
  id: string;
  flightId: string;
  row: number;
  letter: SeatView['letter'];
  status: SeatStatus;
  heldBy: string | null;
  holdExpiresAt: Date | null;
}

/**
 * Almacén de asientos en memoria con las mismas reglas atómicas que los adaptadores Prisma:
 * vista perezosa de vencimientos y UPDATE condicional simulado. Participa en el rollback.
 */
export class InMemorySeatStore
  implements SeatHoldsPort, SeatQueryPort, SeatBookingPort, SeatReleasePort, Transactional
{
  private seats = new Map<string, StoredSeat>();

  addFlight(flightId: string): void {
    for (const { row, letter } of allSeatPositions()) {
      this.seats.set(key(flightId, formatSeatCode(row, letter)), {
        id: seatIdOf(flightId, formatSeatCode(row, letter)),
        flightId,
        row,
        letter,
        status: 'AVAILABLE',
        heldBy: null,
        holdExpiresAt: null,
      });
    }
  }

  seat(flightId: string, seatCode: string): StoredSeat {
    const seat = this.seats.get(key(flightId, seatCode));
    if (seat === undefined) {
      throw new Error(`Asiento inexistente en el doble: ${seatCode}`);
    }
    return seat;
  }

  forceHold(flightId: string, seatCode: string, clientId: string, expiresAt: Date): void {
    Object.assign(this.seat(flightId, seatCode), {
      status: 'HELD',
      heldBy: clientId,
      holdExpiresAt: expiresAt,
    });
  }

  lockClientHolds(flightId: string, clientId: string, now: Date): Promise<ClientHoldSummary> {
    const active = this.activeHolds(clientId, now).filter((seat) => seat.flightId === flightId);
    const expiries = active.map((seat) => (seat.holdExpiresAt as Date).getTime());
    const sharedExpiresAt = expiries.length > 0 ? new Date(Math.min(...expiries)) : null;
    return Promise.resolve({ activeCount: active.length, sharedExpiresAt });
  }

  holdIfAvailable(target: SeatHoldTarget & { expiresAt: Date }): Promise<boolean> {
    const seat = this.seat(target.flightId, formatSeatCode(target.seat.row, target.seat.letter));
    const free =
      seat.status === 'AVAILABLE' || (seat.status === 'HELD' && isExpired(seat, target.now));
    if (free) {
      Object.assign(seat, {
        status: 'HELD',
        heldBy: target.clientId,
        holdExpiresAt: target.expiresAt,
      });
    }
    return Promise.resolve(free);
  }

  releaseIfOwned(target: SeatHoldTarget): Promise<boolean> {
    const seat = this.seat(target.flightId, formatSeatCode(target.seat.row, target.seat.letter));
    const owned =
      seat.status === 'HELD' && seat.heldBy === target.clientId && !isExpired(seat, target.now);
    if (owned) {
      Object.assign(seat, { status: 'AVAILABLE', heldBy: null, holdExpiresAt: null });
    }
    return Promise.resolve(owned);
  }

  getSeats(flightId: string, now: Date): Promise<SeatView[]> {
    const views = [...this.seats.values()]
      .filter((seat) => seat.flightId === flightId)
      .map((seat) => toView(seat, now));
    return Promise.resolve(views);
  }

  getClientHolds(clientId: string, now: Date): Promise<ClientHoldGroup[]> {
    const groups = new Map<string, ClientHoldGroup>();
    for (const seat of this.activeHolds(clientId, now)) {
      const group = groups.get(seat.flightId) ?? {
        flightId: seat.flightId,
        seatCodes: [],
        holdExpiresAt: seat.holdExpiresAt as Date,
      };
      group.seatCodes.push(formatSeatCode(seat.row, seat.letter));
      groups.set(seat.flightId, group);
    }
    return Promise.resolve([...groups.values()]);
  }

  markBooked(request: MarkBookedRequest): Promise<MarkBookedResult> {
    const booked: BookedSeat[] = [];
    for (const position of request.seats) {
      const seat = this.seat(request.flightId, formatSeatCode(position.row, position.letter));
      const owned =
        seat.status === 'HELD' && seat.heldBy === request.clientId && !isExpired(seat, request.now);
      if (owned) {
        Object.assign(seat, { status: 'BOOKED', heldBy: null, holdExpiresAt: null });
        booked.push({ id: seat.id, row: seat.row, letter: seat.letter });
      }
    }
    const remainingActiveHolds = this.activeHolds(request.clientId, request.now).filter(
      (seat) => seat.flightId === request.flightId,
    ).length;
    return Promise.resolve({ booked, remainingActiveHolds });
  }

  findFlightsWithExpiredHolds(now: Date): Promise<string[]> {
    const flights = [...this.seats.values()]
      .filter((seat) => seat.status === 'HELD' && isExpired(seat, now))
      .map((seat) => seat.flightId);
    return Promise.resolve([...new Set(flights)]);
  }

  releaseExpired(flightId: string, now: Date): Promise<string[]> {
    return Promise.resolve(this.release(flightId, (seat) => isExpired(seat, now)));
  }

  releaseAllHeld(flightId: string): Promise<string[]> {
    return Promise.resolve(this.release(flightId, () => true));
  }

  snapshot(): unknown {
    return new Map([...this.seats].map(([id, seat]) => [id, { ...seat }]));
  }

  restore(state: unknown): void {
    this.seats = state as Map<string, StoredSeat>;
  }

  private release(flightId: string, matches: (seat: StoredSeat) => boolean): string[] {
    const released: string[] = [];
    for (const seat of this.seats.values()) {
      if (seat.flightId === flightId && seat.status === 'HELD' && matches(seat)) {
        Object.assign(seat, { status: 'AVAILABLE', heldBy: null, holdExpiresAt: null });
        released.push(formatSeatCode(seat.row, seat.letter));
      }
    }
    return released;
  }

  private activeHolds(clientId: string, now: Date): StoredSeat[] {
    return [...this.seats.values()].filter(
      (seat) => seat.status === 'HELD' && seat.heldBy === clientId && !isExpired(seat, now),
    );
  }
}

function key(flightId: string, seatCode: string): string {
  return `${flightId}:${seatCode}`;
}

/** Id determinista de la fila del asiento en el doble (en la base es un UUID). */
export function seatIdOf(flightId: string, seatCode: string): string {
  return `seat:${flightId}:${seatCode}`;
}

function isExpired(seat: StoredSeat, now: Date): boolean {
  return seat.holdExpiresAt !== null && isHoldExpired(seat.holdExpiresAt, now);
}

function toView(seat: StoredSeat, now: Date): SeatView {
  if (seat.status === 'HELD' && isExpired(seat, now)) {
    return {
      row: seat.row,
      letter: seat.letter,
      status: 'AVAILABLE',
      holderTag: null,
      holdExpiresAt: null,
    };
  }
  return {
    row: seat.row,
    letter: seat.letter,
    status: seat.status,
    holderTag: seat.heldBy === null ? null : holderTagOf(seat.heldBy),
    holdExpiresAt: seat.holdExpiresAt,
  };
}
