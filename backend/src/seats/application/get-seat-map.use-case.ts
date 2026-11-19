import type { FlightQueryPort, FlightView } from '../../flights';
import type { UnitOfWork } from '../../shared-kernel/application/unit-of-work';
import type { Clock } from '../../shared-kernel/domain/clock';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import type { SeatQueryPort, SeatView } from './ports/seat-query.port';

export interface SeatMapResult {
  flight: FlightView;
  seats: SeatView[];
  serverNow: Date;
}

/**
 * Snapshot del mapa: vuelo (`seq`) y asientos en una transacción REPEATABLE READ de solo
 * lectura, para que ambos correspondan al mismo instante (research.md §13).
 */
export class GetSeatMapUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly flights: FlightQueryPort,
    private readonly seats: SeatQueryPort,
    private readonly clock: Clock,
  ) {}

  execute(flightId: string): Promise<SeatMapResult> {
    const now = this.clock.now();
    return this.uow.run(
      async () => {
        const flight = await this.flights.getById(flightId, now);
        if (flight === null) {
          throw new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe');
        }
        return { flight, seats: await this.seats.getSeats(flightId, now), serverNow: now };
      },
      { isolation: 'RepeatableRead', readOnly: true },
    );
  }
}
