import {
  formatSeatCode,
  seatTypeOf,
  type HoldSeatResponse,
  type MyHoldsResponse,
  type SeatDto,
  type SeatMapSnapshot,
} from '@kata/shared';
import { toFlightDto } from '../../flights';
import type { MyHoldsResult } from './get-my-holds.use-case';
import type { SeatMapResult } from './get-seat-map.use-case';
import type { HoldSeatResult } from './hold-seat.use-case';
import type { SeatView } from './ports/seat-query.port';

function toSeatDto(seat: SeatView, price: number): SeatDto {
  return {
    seatId: formatSeatCode(seat.row, seat.letter),
    row: seat.row,
    letter: seat.letter,
    type: seatTypeOf(seat.letter),
    status: seat.status,
    price,
    holderTag: seat.holderTag,
    holdExpiresAt: seat.holdExpiresAt?.toISOString() ?? null,
  };
}

export function toSeatMapSnapshot(result: SeatMapResult): SeatMapSnapshot {
  return {
    flight: toFlightDto(result.flight),
    seats: result.seats.map((seat) => toSeatDto(seat, result.flight.fare)),
    seq: result.flight.seq,
    serverNow: result.serverNow.toISOString(),
  };
}

export function toHoldSeatResponse(result: HoldSeatResult): HoldSeatResponse {
  return {
    flightId: result.flightId,
    seatId: result.seatCode,
    holdExpiresAt: result.holdExpiresAt.toISOString(),
    holderTag: result.holderTag,
    seq: result.seq,
    serverNow: result.serverNow.toISOString(),
  };
}

export function toMyHoldsResponse(result: MyHoldsResult): MyHoldsResponse {
  return {
    holderTag: result.holderTag,
    serverNow: result.serverNow.toISOString(),
    holds: result.holds.map((group) => ({
      flightId: group.flightId,
      seatIds: group.seatCodes,
      holdExpiresAt: group.holdExpiresAt.toISOString(),
    })),
  };
}
