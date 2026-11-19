import {
  allSeatPositions,
  formatSeatCode,
  seatTypeOf,
  type FlightDto,
  type FlightRoomEvent,
  type SeatMapSnapshot,
} from '@kata/shared';
import {
  flightStateReducer,
  initialFlightState,
  isFlightClosed,
  isMine,
  seatCounts,
  type FlightState,
} from './flight-state.reducer';

const FLIGHT_ID = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';
const MY_TAG = 'aaaaaaaaaaaaaaaa';
const OTHER_TAG = 'bbbbbbbbbbbbbbbb';
const AT = '2026-11-18T15:00:00.000Z';
const EXPIRES = '2026-11-18T15:10:00.000Z';

const FLIGHT: FlightDto = {
  id: FLIGHT_ID,
  seq: 4,
  flightNumber: 'KT1000',
  origin: 'BOG',
  destination: 'MDE',
  scheduledDepartureAt: '2026-11-19T15:00:00.000Z',
  departureAt: '2026-11-19T15:00:00.000Z',
  arrivalAt: '2026-11-19T16:00:00.000Z',
  durationMinutes: 60,
  fare: 250_000,
  status: 'SCHEDULED',
  delayed: false,
  availableSeats: 178,
  capacity: 180,
};

function snapshot(seq = 4): SeatMapSnapshot {
  return {
    flight: { ...FLIGHT, seq },
    seq,
    serverNow: AT,
    seats: allSeatPositions().map(({ row, letter }) => {
      const seatId = formatSeatCode(row, letter);
      const held = seatId === '1A';
      return {
        seatId,
        row,
        letter,
        type: seatTypeOf(letter),
        status: held ? 'HELD' : seatId === '1B' ? 'BOOKED' : 'AVAILABLE',
        price: 250_000,
        holderTag: held ? OTHER_TAG : null,
        holdExpiresAt: held ? EXPIRES : null,
      };
    }),
  };
}

const held = (seq: number, seatId: string, holderTag = MY_TAG): FlightRoomEvent => ({
  type: 'seat:held',
  data: {
    flightId: FLIGHT_ID,
    seq,
    occurredAt: AT,
    seatId,
    status: 'HELD',
    holdExpiresAt: EXPIRES,
    holderTag,
  },
});

const released = (seq: number, seatId: string): FlightRoomEvent => ({
  type: 'seat:released',
  data: { flightId: FLIGHT_ID, seq, occurredAt: AT, seatId, status: 'AVAILABLE', reason: 'MANUAL' },
});

const booked = (seq: number, seatId: string): FlightRoomEvent => ({
  type: 'seat:booked',
  data: { flightId: FLIGHT_ID, seq, occurredAt: AT, seatId, status: 'BOOKED' },
});

function apply(state: FlightState, ...events: FlightRoomEvent[]): FlightState {
  return events.reduce(
    (current, event) => flightStateReducer(current, { type: 'event', event }),
    state,
  );
}

const seat = (state: FlightState, seatId: string) =>
  state.seats.find((candidate) => candidate.seatId === seatId);

describe('flightStateReducer', () => {
  const loaded = flightStateReducer(initialFlightState, { type: 'snapshot', snapshot: snapshot() });

  it('un snapshot reemplaza el estado y fija la seq', () => {
    expect(loaded.seq).toBe(4);
    expect(loaded.seats).toHaveLength(180);
    expect(loaded.flight?.id).toBe(FLIGHT_ID);
    expect(loaded.needsResync).toBe(false);
  });

  it('aplica solo seq === última + 1', () => {
    const next = apply(loaded, held(5, '12C'), released(6, '12C'), held(7, '12D'));
    expect(next.seq).toBe(7);
    expect(seat(next, '12C')).toMatchObject({
      status: 'AVAILABLE',
      holderTag: null,
      holdExpiresAt: null,
    });
    expect(seat(next, '12D')).toMatchObject({
      status: 'HELD',
      holderTag: MY_TAG,
      holdExpiresAt: EXPIRES,
    });
  });

  it('descarta duplicados y eventos viejos sin cambiar nada', () => {
    const once = apply(loaded, held(5, '12C'));
    expect(apply(once, held(5, '12C'), released(3, '12C'))).toBe(once);
  });

  it('un hueco marca needsResync y no aplica el evento', () => {
    const next = apply(loaded, held(6, '12C'));
    expect(next.needsResync).toBe(true);
    expect(next.seq).toBe(4);
    expect(seat(next, '12C')?.status).toBe('AVAILABLE');
    const recovered = flightStateReducer(next, { type: 'snapshot', snapshot: snapshot(6) });
    expect(recovered.needsResync).toBe(false);
    expect(recovered.seq).toBe(6);
  });

  it('ignora eventos antes del primer snapshot', () => {
    expect(apply(initialFlightState, held(1, '1A'))).toBe(initialFlightState);
  });

  it('reconoce los asientos propios por holderTag', () => {
    const next = apply(loaded, held(5, '12C'));
    expect(isMine(seat(next, '12C'), MY_TAG)).toBe(true);
    expect(isMine(seat(next, '1A'), MY_TAG)).toBe(false);
    expect(isMine(seat(next, '12C'), null)).toBe(false);
  });

  it('flight:updated CANCELLED o SOLD_OUT cierra el vuelo', () => {
    expect(isFlightClosed(loaded.flight)).toBe(false);
    for (const status of ['CANCELLED', 'SOLD_OUT'] as const) {
      const next = apply(loaded, {
        type: 'flight:updated',
        data: {
          flightId: FLIGHT_ID,
          seq: 5,
          occurredAt: AT,
          status,
          scheduledDepartureAt: FLIGHT.scheduledDepartureAt,
          departureAt: FLIGHT.departureAt,
          arrivalAt: FLIGHT.arrivalAt,
          delayed: false,
          change: status,
        },
      });
      expect(next.flight?.status).toBe(status);
      expect(isFlightClosed(next.flight)).toBe(true);
    }
  });

  it('los contadores derivados siempre suman el total', () => {
    const states = [
      loaded,
      apply(loaded, held(5, '12C')),
      apply(loaded, held(5, '12C'), booked(6, '12C'), booked(7, '30F'), released(8, '1A')),
    ];
    for (const state of states) {
      const counts = seatCounts(state);
      expect(counts.available + counts.held + counts.booked).toBe(counts.total);
      expect(counts.total).toBe(180);
    }
    expect(seatCounts(states[2] as FlightState)).toEqual({
      available: 177,
      held: 0,
      booked: 3,
      total: 180,
    });
  });

  it('confirma un bloqueo propio con la respuesta 201 sin tocar la seq', () => {
    const next = flightStateReducer(loaded, {
      type: 'holdConfirmed',
      seatId: '20B',
      holderTag: MY_TAG,
      holdExpiresAt: EXPIRES,
    });
    expect(next.seq).toBe(4);
    expect(seat(next, '20B')).toMatchObject({ status: 'HELD', holderTag: MY_TAG });
    const sameEvent = apply(next, held(5, '20B'));
    expect(sameEvent.seq).toBe(5);
  });

  it('la liberación confirmada (204) solo afecta a un bloqueo propio', () => {
    const mine = apply(loaded, held(5, '12C'));
    const freed = flightStateReducer(mine, {
      type: 'releaseConfirmed',
      seatId: '12C',
      holderTag: MY_TAG,
    });
    expect(seat(freed, '12C')?.status).toBe('AVAILABLE');
    const notMine = flightStateReducer(mine, {
      type: 'releaseConfirmed',
      seatId: '1A',
      holderTag: MY_TAG,
    });
    expect(seat(notMine, '1A')?.status).toBe('HELD');
  });
});
