import type { Clock } from '../domain/clock';
import type { EventPublisher } from './event-publisher';
import type { FlightEventLog } from './flight-event-log.port';
import type { FlightStatsReader } from './flight-stats-reader.port';
import type { FlightWriteLock } from './flight-write-lock.port';
import type { UnitOfWork } from './unit-of-work';

/**
 * Objeto de dependencias de toda operación que escribe sobre un vuelo (research.md §24).
 * Agrupa los puertos transversales para que los casos de uso respeten `max-params` ≤ 4.
 */
export const FLIGHT_WRITE_CONTEXT = Symbol('FlightWriteContext');

export interface FlightWriteContext {
  uow: UnitOfWork;
  writeLock: FlightWriteLock;
  eventLog: FlightEventLog;
  statsReader: FlightStatsReader;
  publisher: EventPublisher;
  clock: Clock;
}
