import type {
  FlightQueryPort,
  FlightReschedule,
  FlightSearchCriteria,
  FlightStatusPort,
  FlightView,
} from '../../src/flights';
import type { StubFlightWriteLock, Transactional } from './shared-kernel.doubles';

export function sampleFlightView(overrides: Partial<FlightView> = {}): FlightView {
  const departureAt = new Date('2026-11-19T15:00:00.000Z');
  return {
    id: '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10',
    flightNumber: 'KT1000',
    origin: 'BOG',
    destination: 'MDE',
    scheduledDepartureAt: departureAt,
    departureAt,
    arrivalAt: new Date(departureAt.getTime() + 55 * 60_000),
    fare: 210_000,
    status: 'SCHEDULED',
    capacity: 180,
    seq: 0,
    availableSeats: 180,
    ...overrides,
  };
}

/** Consulta de vuelos en memoria con la misma semántica que el adaptador Prisma. */
export class InMemoryFlightQuery implements FlightQueryPort {
  readonly flights = new Map<string, FlightView>();
  readonly searches: FlightSearchCriteria[] = [];

  add(view: FlightView): void {
    this.flights.set(view.id, view);
  }

  getById(flightId: string): Promise<FlightView | null> {
    return Promise.resolve(this.flights.get(flightId) ?? null);
  }

  /** Mismo contrato que el adaptador: ruta exacta, salida en `[start, end)`, sin orden garantizado. */
  search(criteria: FlightSearchCriteria): Promise<FlightView[]> {
    this.searches.push(criteria);
    const matches = [...this.flights.values()].filter(
      (flight) =>
        flight.origin === criteria.origin &&
        flight.destination === criteria.destination &&
        flight.departureAt >= criteria.departureFrom &&
        flight.departureAt < criteria.departureTo,
    );
    // Orden inverso a propósito: el caso de uso no debe depender del orden del adaptador.
    return Promise.resolve(matches.toReversed());
  }
}

/**
 * Estado del vuelo en memoria sobre la misma vista que `InMemoryFlightQuery` (y el lock simulado),
 * con las mismas condiciones atómicas que el adaptador Prisma. Participa en el rollback.
 */
export class InMemoryFlightStatus implements FlightStatusPort, Transactional {
  constructor(
    private readonly query: InMemoryFlightQuery,
    private readonly lock?: StubFlightWriteLock,
  ) {}

  markSoldOutIfFull(): Promise<boolean> {
    return Promise.resolve(false);
  }

  delay(flightId: string, schedule: FlightReschedule): Promise<boolean> {
    const flight = this.query.flights.get(flightId);
    if (flight === undefined || flight.status === 'CANCELLED') {
      return Promise.resolve(false);
    }
    const status = flight.status === 'SOLD_OUT' ? 'SOLD_OUT' : 'DELAYED';
    this.save({ ...flight, ...schedule, status });
    return Promise.resolve(true);
  }

  cancel(flightId: string): Promise<boolean> {
    const flight = this.query.flights.get(flightId);
    if (flight === undefined || flight.status === 'CANCELLED') {
      return Promise.resolve(false);
    }
    this.save({ ...flight, status: 'CANCELLED' });
    return Promise.resolve(true);
  }

  snapshot(): unknown {
    return new Map(this.query.flights);
  }

  restore(state: unknown): void {
    this.query.flights.clear();
    (state as Map<string, FlightView>).forEach((view, id) => this.query.flights.set(id, view));
    this.query.flights.forEach((view) => this.syncLock(view));
  }

  private save(view: FlightView): void {
    this.query.flights.set(view.id, view);
    this.syncLock(view);
  }

  private syncLock(view: FlightView): void {
    this.lock?.setFlight(view.id, { status: view.status, departureAt: view.departureAt });
  }
}
