import type { Clock } from '../../shared-kernel/domain/clock';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import type { FlightQueryPort, FlightView } from './ports/flight-query.port';

/** Detalle de un vuelo con su `seq` (la búsqueda lo usa para resincronizarse ante un salto). */
export class GetFlightUseCase {
  constructor(
    private readonly flights: FlightQueryPort,
    private readonly clock: Clock,
  ) {}

  async execute(flightId: string): Promise<FlightView> {
    const flight = await this.flights.getById(flightId, this.clock.now());
    if (flight === null) {
      throw new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe');
    }
    return flight;
  }
}
