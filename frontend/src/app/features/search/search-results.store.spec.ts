import { TestBed } from '@angular/core/testing';
import type { FlightDto, FlightStatsEvent } from '@kata/shared';
import { Subject } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { RealtimeService } from '../../core/realtime.service';
import { SearchResultsStore } from './search-results.store';

const QUERY = { origin: 'BOG', destination: 'MDE', date: '2026-11-19' } as const;

function flight(id: string, overrides: Partial<FlightDto> = {}): FlightDto {
  return {
    id,
    seq: 10,
    flightNumber: `KT${id}`,
    origin: 'BOG',
    destination: 'MDE',
    scheduledDepartureAt: '2026-11-19T15:00:00.000Z',
    departureAt: '2026-11-19T15:00:00.000Z',
    arrivalAt: '2026-11-19T16:00:00.000Z',
    durationMinutes: 60,
    fare: 250_000,
    status: 'SCHEDULED',
    delayed: false,
    availableSeats: 180,
    capacity: 180,
    ...overrides,
  };
}

function stats(
  flightId: string,
  seq: number,
  overrides: Partial<FlightStatsEvent> = {},
): FlightStatsEvent {
  return {
    flightId,
    seq,
    occurredAt: '2026-11-18T15:00:00.000Z',
    status: 'SCHEDULED',
    departureAt: '2026-11-19T15:00:00.000Z',
    arrivalAt: '2026-11-19T16:00:00.000Z',
    delayed: false,
    availableSeats: 180 - seq,
    stats: { available: 180 - seq, held: seq, booked: 0, total: 180 },
    ...overrides,
  };
}

describe('SearchResultsStore', () => {
  let statsEvents: Subject<FlightStatsEvent>;
  let reconnected: Subject<void>;
  let api: { searchFlights: ReturnType<typeof vi.fn>; getFlight: ReturnType<typeof vi.fn> };
  let store: SearchResultsStore;

  beforeEach(async () => {
    vi.useFakeTimers();
    statsEvents = new Subject();
    reconnected = new Subject();
    api = {
      searchFlights: vi.fn().mockResolvedValue([flight('A'), flight('B', { seq: 3 })]),
      getFlight: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        SearchResultsStore,
        { provide: ApiService, useValue: api },
        {
          provide: RealtimeService,
          useValue: {
            on: () => statsEvents.asObservable(),
            reconnected$: reconnected.asObservable(),
            subscribeSearch: vi.fn().mockResolvedValue({ ok: true }),
            unsubscribeSearch: vi.fn(),
          },
        },
      ],
    });
    store = TestBed.inject(SearchResultsStore);
    await store.search(QUERY);
  });

  afterEach(() => vi.useRealTimers());

  const byId = (id: string) => store.flights().find((candidate) => candidate.id === id);

  it('aplica solo seq === última + 1 y descarta duplicados y viejos', () => {
    statsEvents.next(stats('A', 11));
    expect(byId('A')).toMatchObject({ seq: 11, availableSeats: 169 });
    statsEvents.next(stats('A', 11, { availableSeats: 1 }));
    statsEvents.next(stats('A', 9, { availableSeats: 2 }));
    expect(byId('A')).toMatchObject({ seq: 11, availableSeats: 169 });
    expect(api.getFlight).not.toHaveBeenCalled();
  });

  it('ignora los eventos de vuelos no listados', () => {
    statsEvents.next(stats('Z', 1));
    expect(store.flights().map((candidate) => candidate.id)).toEqual(['A', 'B']);
    expect(api.getFlight).not.toHaveBeenCalled();
  });

  it('ante un salto pide GET /api/flights/:id una sola vez, agrupando en 250 ms', async () => {
    api.getFlight.mockResolvedValue(flight('A', { seq: 15, availableSeats: 100 }));
    statsEvents.next(stats('A', 13));
    statsEvents.next(stats('A', 14));
    expect(api.getFlight).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(api.getFlight).toHaveBeenCalledTimes(1);
    expect(api.getFlight).toHaveBeenCalledWith('A', { silent: true });
    expect(byId('A')).toMatchObject({ seq: 15, availableSeats: 100 });
    statsEvents.next(stats('A', 15));
    statsEvents.next(stats('A', 16, { availableSeats: 99 }));
    expect(byId('A')).toMatchObject({ seq: 16, availableSeats: 99 });
  });

  it('agrupa los saltos de varios vuelos en la misma ventana', async () => {
    api.getFlight.mockImplementation((id: string) => Promise.resolve(flight(id, { seq: 50 })));
    statsEvents.next(stats('A', 20));
    statsEvents.next(stats('B', 20));
    await vi.advanceTimersByTimeAsync(250);
    expect(api.getFlight.mock.calls.map((call) => call[0]).sort()).toEqual(['A', 'B']);
  });

  it('un cambio de estado actualiza el resultado y deja un aviso', () => {
    statsEvents.next(
      stats('A', 11, {
        status: 'DELAYED',
        delayed: true,
        departureAt: '2026-11-19T16:30:00.000Z',
        arrivalAt: '2026-11-19T17:30:00.000Z',
        change: 'DELAYED',
      }),
    );
    expect(byId('A')).toMatchObject({
      status: 'DELAYED',
      delayed: true,
      departureAt: '2026-11-19T16:30:00.000Z',
    });
    expect(store.notices()).toEqual({ A: 'DELAYED' });
  });

  it('al reconectar vuelve a ejecutar la búsqueda (resincronización)', async () => {
    api.searchFlights.mockResolvedValue([flight('A', { seq: 30, status: 'CANCELLED' })]);
    reconnected.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.searchFlights).toHaveBeenCalledTimes(2);
    expect(store.flights()).toEqual([flight('A', { seq: 30, status: 'CANCELLED' })]);
  });

  it('una búsqueda vacía queda en estado listo sin resultados', async () => {
    api.searchFlights.mockResolvedValue([]);
    await store.search({ ...QUERY, destination: 'CLO' });
    expect(store.status()).toBe('ready');
    expect(store.flights()).toEqual([]);
  });
});
