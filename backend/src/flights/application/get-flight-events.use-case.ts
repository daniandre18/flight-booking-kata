import type { FlightEventType, ReleaseReason } from '@kata/shared';
import type { RecordedFlightEvent } from '../../shared-kernel/application/flight-event-log.port';
import type { FlightEventQueryPort } from '../../shared-kernel/application/flight-event-query.port';
import type { Clock } from '../../shared-kernel/domain/clock';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import type { FlightQueryPort } from './ports/flight-query.port';

export const DEFAULT_ACTIVITY_LIMIT = 50;

export interface ActivityEntry {
  seq: number;
  type: FlightEventType;
  seatId: string | null;
  status: string;
  reason?: ReleaseReason;
  occurredAt: Date;
}

function toEntry(event: RecordedFlightEvent): ActivityEntry {
  const entry: ActivityEntry = {
    seq: event.seq,
    type: event.type,
    seatId: event.seatCode,
    status: String(event.payload['status'] ?? ''),
    occurredAt: event.occurredAt,
  };
  const reason = event.payload['reason'];
  return typeof reason === 'string' ? { ...entry, reason: reason as ReleaseReason } : entry;
}

/** Registro de actividad del tablero (RUX-030): los más recientes primero. */
export class GetFlightEventsUseCase {
  constructor(
    private readonly flights: FlightQueryPort,
    private readonly events: FlightEventQueryPort,
    private readonly clock: Clock,
  ) {}

  async execute(flightId: string, limit = DEFAULT_ACTIVITY_LIMIT): Promise<ActivityEntry[]> {
    const flight = await this.flights.getById(flightId, this.clock.now());
    if (flight === null) {
      throw new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe');
    }
    const recent = await this.events.recent(flightId, limit);
    return recent.map(toEntry);
  }
}
