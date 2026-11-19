import type { FlightStatus, SeatCounts } from '@kata/shared';

/** Estadísticas y resumen del vuelo con vista perezosa (HELD vencido cuenta como disponible). */
export const FLIGHT_STATS_READER = Symbol('FlightStatsReader');

export interface FlightSummary {
  flightId: string;
  seq: number;
  status: FlightStatus;
  scheduledDepartureAt: Date;
  departureAt: Date;
  arrivalAt: Date;
  delayed: boolean;
  counts: SeatCounts;
}

export interface FlightStatsReader {
  /** `seq` y conteos del mismo instante; `null` si el vuelo no existe. */
  summary(flightId: string, now: Date): Promise<FlightSummary | null>;
}
