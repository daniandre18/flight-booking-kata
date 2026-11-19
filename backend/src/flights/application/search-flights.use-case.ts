import type { SearchFlightsQuery } from '@kata/shared';
import type { Clock } from '../../shared-kernel/domain/clock';
import { bogotaDayRange } from '../domain/bogota-day';
import type { FlightQueryPort, FlightView } from './ports/flight-query.port';

/**
 * Busca vuelos de una ruta en un día de Bogotá (HU1, RF-001 a RF-005). Incluye los cancelados con
 * su estado y los ordena por salida vigente: un retraso que cambia de día mueve el vuelo de fecha.
 */
export class SearchFlightsUseCase {
  constructor(
    private readonly flights: FlightQueryPort,
    private readonly clock: Clock,
  ) {}

  async execute(query: SearchFlightsQuery): Promise<FlightView[]> {
    const { start, end } = bogotaDayRange(query.date);
    const found = await this.flights.search({
      origin: query.origin,
      destination: query.destination,
      departureFrom: start,
      departureTo: end,
      now: this.clock.now(),
    });
    return found.toSorted((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
  }
}
