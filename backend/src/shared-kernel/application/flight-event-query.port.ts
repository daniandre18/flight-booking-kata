import type { RecordedFlightEvent } from './flight-event-log.port';

/**
 * Lectura del registro de actividad (I de SOLID: separada de `FlightEventLog`, que escribe).
 * Alimenta el tablero (últimos 50, research.md §13).
 */
export const FLIGHT_EVENT_QUERY = Symbol('FlightEventQueryPort');

export interface FlightEventQueryPort {
  /** Los `limit` eventos más recientes del vuelo, del más nuevo al más viejo. */
  recent(flightId: string, limit: number): Promise<RecordedFlightEvent[]>;
}
