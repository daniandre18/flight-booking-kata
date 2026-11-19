import { TestBed } from '@angular/core/testing';
import {
  allSeatPositions,
  formatSeatCode,
  seatTypeOf,
  type ActivityEntryDto,
  type SeatMapSnapshot,
} from '@kata/shared';
import { Subject } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FlightRoomSync } from '../../core/flight-state/flight-room-sync';
import { RealtimeService } from '../../core/realtime.service';
import { DashboardStore } from './dashboard.store';

const FLIGHT_ID = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';
const AT = '2026-11-18T15:00:00.000Z';
const TAG = 'aaaaaaaaaaaaaaaa';

function snapshot(seq: number, booked: string[] = []): SeatMapSnapshot {
  return {
    seq,
    serverNow: AT,
    flight: {
      id: FLIGHT_ID,
      seq,
      flightNumber: 'KT1000',
      origin: 'BOG',
      destination: 'MDE',
      scheduledDepartureAt: AT,
      departureAt: AT,
      arrivalAt: AT,
      durationMinutes: 60,
      fare: 250_000,
      status: 'SCHEDULED',
      delayed: false,
      availableSeats: 180 - booked.length,
      capacity: 180,
    },
    seats: allSeatPositions().map(({ row, letter }) => {
      const seatId = formatSeatCode(row, letter);
      return {
        seatId,
        row,
        letter,
        type: seatTypeOf(letter),
        status: booked.includes(seatId) ? 'BOOKED' : 'AVAILABLE',
        price: 250_000,
        holderTag: null,
        holdExpiresAt: null,
      };
    }),
  };
}

const entry = (seq: number): ActivityEntryDto => ({
  seq,
  type: 'SEAT_BOOKED',
  seatId: '1A',
  status: 'BOOKED',
  occurredAt: AT,
});

describe('DashboardStore', () => {
  let held: Subject<unknown>;
  let released: Subject<unknown>;
  let api: { getSeatMap: ReturnType<typeof vi.fn>; getFlightEvents: ReturnType<typeof vi.fn> };
  let store: DashboardStore;

  const seatHeld = (seq: number, seatId: string) =>
    held.next({
      flightId: FLIGHT_ID,
      seq,
      occurredAt: AT,
      seatId,
      status: 'HELD',
      holdExpiresAt: AT,
      holderTag: TAG,
    });
  const seatReleased = (seq: number, seatId: string) =>
    released.next({
      flightId: FLIGHT_ID,
      seq,
      occurredAt: AT,
      seatId,
      status: 'AVAILABLE',
      reason: 'EXPIRED',
    });

  beforeEach(async () => {
    held = new Subject();
    released = new Subject();
    const empty = new Subject<unknown>();
    api = {
      getSeatMap: vi.fn().mockResolvedValue(snapshot(2, ['1A'])),
      // El registro puede traer una entrada posterior al snapshot: no debe duplicarse.
      getFlightEvents: vi.fn().mockResolvedValue([entry(3), entry(2), entry(1)]),
    };
    const streams: Record<string, Subject<unknown>> = {
      'seat:held': held,
      'seat:released': released,
    };
    TestBed.configureTestingModule({
      providers: [
        FlightRoomSync,
        DashboardStore,
        { provide: ApiService, useValue: api },
        {
          provide: RealtimeService,
          useValue: {
            on: (event: string) => (streams[event] ?? empty).asObservable(),
            reconnected$: new Subject<void>().asObservable(),
            joinFlight: vi.fn().mockResolvedValue({ ok: true, seq: 2 }),
            leaveFlight: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
    store = TestBed.inject(DashboardStore);
    await store.init(FLIGHT_ID);
  });

  it('carga snapshot y registro; los contadores suman el total y la ocupación se deriva', () => {
    expect(store.counts()).toEqual({ available: 179, held: 0, booked: 1, total: 180 });
    expect(store.occupancyPercent()).toBe(0.6);
    expect(store.activity().map((item) => item.seq)).toEqual([2, 1]);
  });

  it('cada evento aplicado se antepone al registro y actualiza los contadores', () => {
    seatHeld(3, '12C');
    seatReleased(4, '12C');
    seatHeld(5, '12D');
    expect(store.activity().map((item) => item.seq)).toEqual([5, 4, 3, 2, 1]);
    expect(store.activity()[1]).toMatchObject({
      type: 'SEAT_RELEASED',
      seatId: '12C',
      reason: 'EXPIRED',
    });
    const counts = store.counts();
    expect(counts).toEqual({ available: 178, held: 1, booked: 1, total: 180 });
    expect(counts.available + counts.held + counts.booked).toBe(counts.total);
  });

  it('descarta eventos duplicados', () => {
    seatHeld(3, '12C');
    seatHeld(3, '12C');
    seatHeld(2, '12C');
    expect(store.activity().map((item) => item.seq)).toEqual([3, 2, 1]);
    expect(store.counts().held).toBe(1);
  });

  it('ante un salto pide un nuevo snapshot y registro', async () => {
    api.getSeatMap.mockResolvedValue(snapshot(9, ['1A', '1B']));
    api.getFlightEvents.mockResolvedValue([entry(9), entry(8)]);
    seatHeld(7, '12C');
    await vi.waitFor(() => expect(store.counts().booked).toBe(2));
    expect(api.getSeatMap).toHaveBeenCalledTimes(2);
    expect(store.activity().map((item) => item.seq)).toEqual([9, 8]);
  });
});
