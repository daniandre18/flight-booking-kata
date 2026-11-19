import type { ReleaseReason } from '@kata/shared';
import type { SeatReleased } from '../../shared-kernel/application/event-publisher';
import type {
  FlightEventDraft,
  RecordedFlightEvent,
} from '../../shared-kernel/application/flight-event-log.port';
import { isSeatEvent } from '../../shared-kernel/application/record-flight-change';

/**
 * Única construcción de los eventos de liberación (DRY): manual, vencimiento y cancelación.
 * El payload guardado en `flight_events` es el mismo que viaja en `seat:released`.
 */
export function seatReleasedDrafts(
  seatCodes: readonly string[],
  reason: ReleaseReason,
  occurredAt: Date,
): FlightEventDraft[] {
  return seatCodes.map((seatCode) => ({
    type: 'SEAT_RELEASED',
    seatCode,
    payload: { seatId: seatCode, status: 'AVAILABLE', reason },
    occurredAt,
  }));
}

export function seatReleasedEvents(
  events: readonly RecordedFlightEvent[],
  reason: ReleaseReason,
): SeatReleased[] {
  return events.filter(isSeatEvent).map((event) => ({
    type: 'SeatReleased',
    flightId: event.flightId,
    seq: event.seq,
    occurredAt: event.occurredAt,
    seatCode: event.seatCode,
    reason,
  }));
}
