import type { FlightStatsReader } from '../../shared-kernel/application/flight-stats-reader.port';
import type { Clock } from '../../shared-kernel/domain/clock';
import { DomainError } from '../../shared-kernel/domain/domain-error';

export interface FlightStats {
  flightId: string;
  seq: number;
  available: number;
  held: number;
  booked: number;
  total: number;
  /** Reservados ÷ total, con un decimal (RUX-029). */
  occupancyPercent: number;
}

/** Ocupación del vuelo para el tablero, con vista perezosa (HELD vencido = disponible). */
export class GetFlightStatsUseCase {
  constructor(
    private readonly statsReader: FlightStatsReader,
    private readonly clock: Clock,
  ) {}

  async execute(flightId: string): Promise<FlightStats> {
    const summary = await this.statsReader.summary(flightId, this.clock.now());
    if (summary === null) {
      throw new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe');
    }
    const { counts } = summary;
    const occupancy = counts.total === 0 ? 0 : (counts.booked / counts.total) * 100;
    return {
      flightId: summary.flightId,
      seq: summary.seq,
      ...counts,
      occupancyPercent: Math.round(occupancy * 10) / 10,
    };
  }
}
