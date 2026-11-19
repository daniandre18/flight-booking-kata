import type { FlightChange } from '@kata/shared';
import type { FlightUpdated } from '../../shared-kernel/application/event-publisher';
import type {
  FlightEventDraft,
  RecordedFlightEvent,
} from '../../shared-kernel/application/flight-event-log.port';
import { isDelayed, type FlightSchedule } from '../domain/flight';

/**
 * Única construcción de los eventos de cambio de estado del vuelo (DRY): AGOTADO (bookings) y
 * retraso o cancelación (admin). El payload guardado en `flight_events` es el de `flight:updated`.
 */
export function flightUpdatedDraft(
  schedule: FlightSchedule,
  change: FlightChange,
  occurredAt: Date,
): FlightEventDraft {
  return {
    type: 'FLIGHT_UPDATED',
    seatCode: null,
    payload: {
      status: schedule.status,
      scheduledDepartureAt: schedule.scheduledDepartureAt.toISOString(),
      departureAt: schedule.departureAt.toISOString(),
      arrivalAt: schedule.arrivalAt.toISOString(),
      delayed: isDelayed(schedule.scheduledDepartureAt, schedule.departureAt),
      change,
    },
    occurredAt,
  };
}

/** Eventos de dominio a publicar tras el commit, con la `seq` asignada a cada `FLIGHT_UPDATED`. */
export function flightUpdatedEvents(
  recorded: readonly RecordedFlightEvent[],
  schedule: FlightSchedule,
  change: FlightChange,
): FlightUpdated[] {
  return recorded
    .filter((event) => event.type === 'FLIGHT_UPDATED')
    .map((event) => ({
      type: 'FlightUpdated',
      flightId: event.flightId,
      seq: event.seq,
      occurredAt: event.occurredAt,
      status: schedule.status,
      scheduledDepartureAt: schedule.scheduledDepartureAt,
      departureAt: schedule.departureAt,
      arrivalAt: schedule.arrivalAt,
      delayed: isDelayed(schedule.scheduledDepartureAt, schedule.departureAt),
      change,
    }));
}
