import type { FlightQueryPort, FlightSearchCriteria, FlightView } from '../../src/flights';

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
