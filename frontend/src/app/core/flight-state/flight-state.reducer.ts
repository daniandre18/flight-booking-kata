import type {
  FlightDto,
  FlightRoomEvent,
  SeatCounts,
  SeatDto,
  SeatMapSnapshot,
} from '@kata/shared';

/**
 * Reductor puro compartido por el mapa y el tablero (contracts/realtime-events.md § Reglas para el
 * cliente). Aplica un evento solo si `seq === última + 1`, descarta duplicados y viejos, y ante un
 * hueco marca `needsResync` para pedir un snapshot. Los contadores se derivan de los asientos.
 */
export type SeatState = SeatDto;

export interface FlightState {
  flight: FlightDto | null;
  /** Ordenados por fila y letra. */
  seats: readonly SeatState[];
  seq: number;
  needsResync: boolean;
}

export type FlightAction =
  | { type: 'snapshot'; snapshot: SeatMapSnapshot }
  | { type: 'event'; event: FlightRoomEvent }
  /** Respuesta 201 del bloqueo propio: confirma el asiento sin tocar `seq` (su evento llega aparte). */
  | { type: 'holdConfirmed'; seatId: string; holderTag: string; holdExpiresAt: string }
  /** Respuesta 204 de la liberación propia. */
  | { type: 'releaseConfirmed'; seatId: string; holderTag: string };

export const initialFlightState: FlightState = {
  flight: null,
  seats: [],
  seq: 0,
  needsResync: false,
};

const LETTERS = 'ABCDEF';
const bySeatOrder = (a: SeatState, b: SeatState): number =>
  a.row - b.row || LETTERS.indexOf(a.letter) - LETTERS.indexOf(b.letter);

function patchSeat(state: FlightState, seatId: string, patch: Partial<SeatState>): FlightState {
  return {
    ...state,
    seats: state.seats.map((seat) => (seat.seatId === seatId ? { ...seat, ...patch } : seat)),
  };
}

const FREE = { status: 'AVAILABLE', holderTag: null, holdExpiresAt: null } as const;

function applyEvent(state: FlightState, event: FlightRoomEvent): FlightState {
  switch (event.type) {
    case 'seat:held':
      return patchSeat(state, event.data.seatId, {
        status: 'HELD',
        holderTag: event.data.holderTag,
        holdExpiresAt: event.data.holdExpiresAt,
      });
    case 'seat:released':
      return patchSeat(state, event.data.seatId, FREE);
    case 'seat:booked':
      return patchSeat(state, event.data.seatId, { ...FREE, status: 'BOOKED' });
    case 'flight:updated': {
      const { status, departureAt, arrivalAt, scheduledDepartureAt, delayed } = event.data;
      const flight =
        state.flight === null
          ? null
          : { ...state.flight, status, departureAt, arrivalAt, scheduledDepartureAt, delayed };
      return { ...state, flight };
    }
  }
}

function reduceEvent(state: FlightState, event: FlightRoomEvent): FlightState {
  if (state.flight === null || event.data.seq <= state.seq) {
    return state;
  }
  if (event.data.seq !== state.seq + 1) {
    return state.needsResync ? state : { ...state, needsResync: true };
  }
  return { ...applyEvent(state, event), seq: event.data.seq };
}

export function flightStateReducer(state: FlightState, action: FlightAction): FlightState {
  switch (action.type) {
    case 'snapshot':
      return {
        flight: action.snapshot.flight,
        seats: [...action.snapshot.seats].sort(bySeatOrder),
        seq: action.snapshot.seq,
        needsResync: false,
      };
    case 'event':
      return reduceEvent(state, action.event);
    case 'holdConfirmed':
      return patchSeat(state, action.seatId, {
        status: 'HELD',
        holderTag: action.holderTag,
        holdExpiresAt: action.holdExpiresAt,
      });
    case 'releaseConfirmed': {
      const seat = state.seats.find((candidate) => candidate.seatId === action.seatId);
      return isMine(seat, action.holderTag) ? patchSeat(state, action.seatId, FREE) : state;
    }
  }
}

export function isMine(seat: SeatState | undefined, holderTag: string | null): boolean {
  return holderTag !== null && seat?.status === 'HELD' && seat.holderTag === holderTag;
}

/** CANCELADO o AGOTADO: el mapa entero queda deshabilitado (RUX-007). */
export function isFlightClosed(flight: FlightDto | null): boolean {
  return flight?.status === 'CANCELLED' || flight?.status === 'SOLD_OUT';
}

/** Contadores derivados del estado de asientos: siempre suman el total (CE-005). */
export function seatCounts(state: FlightState): SeatCounts {
  const counts: SeatCounts = { available: 0, held: 0, booked: 0, total: state.seats.length };
  for (const seat of state.seats) {
    if (seat.status === 'BOOKED') {
      counts.booked += 1;
    } else if (seat.status === 'HELD') {
      counts.held += 1;
    } else {
      counts.available += 1;
    }
  }
  return counts;
}
