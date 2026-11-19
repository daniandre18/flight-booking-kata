import { formatSeatCode } from '@kata/shared';
import {
  flightUpdatedDraft,
  flightUpdatedEvents,
  type FlightSchedule,
  type FlightView,
} from '../../flights';
import type { DomainEvent, SeatBooked } from '../../shared-kernel/application/event-publisher';
import type {
  FlightEventDraft,
  RecordedFlightEvent,
} from '../../shared-kernel/application/flight-event-log.port';
import type { FlightSummary } from '../../shared-kernel/application/flight-stats-reader.port';
import {
  isSeatEvent,
  statsChangedEvent,
} from '../../shared-kernel/application/record-flight-change';
import type { BookedPassenger } from '../domain/booking-policy';

export interface BookingChange {
  booked: readonly BookedPassenger[];
  /** Vuelo leído en la transacción (horas vigentes para `flight:updated`). */
  flight: FlightView;
  soldOut: boolean;
  occurredAt: Date;
}

/** Estado anunciado cuando la reserva agota el vuelo (research.md §14). */
function soldOutSchedule(flight: FlightView): FlightSchedule {
  return {
    status: 'SOLD_OUT',
    scheduledDepartureAt: flight.scheduledDepartureAt,
    departureAt: flight.departureAt,
    arrivalAt: flight.arrivalAt,
  };
}

/** Un `SEAT_BOOKED` por asiento y, si se agotó, un `FLIGHT_UPDATED` (seq consecutivas). */
export function bookingDrafts(change: BookingChange): FlightEventDraft[] {
  const { occurredAt } = change;
  const seatDrafts = change.booked.map((seat): FlightEventDraft => {
    const seatCode = formatSeatCode(seat.row, seat.letter);
    return {
      type: 'SEAT_BOOKED',
      seatCode,
      payload: { seatId: seatCode, status: 'BOOKED' },
      occurredAt,
    };
  });
  if (!change.soldOut) {
    return seatDrafts;
  }
  return [
    ...seatDrafts,
    flightUpdatedDraft(soldOutSchedule(change.flight), 'SOLD_OUT', occurredAt),
  ];
}

/** Eventos a publicar tras el commit: asientos, AGOTADO si aplica y el resumen de búsqueda. */
export function bookingEvents(
  change: BookingChange,
  recorded: readonly RecordedFlightEvent[],
  summary: FlightSummary | null,
): DomainEvent[] {
  const seatEvents = recorded.filter(isSeatEvent).map((event): SeatBooked => ({
    type: 'SeatBooked',
    flightId: event.flightId,
    seq: event.seq,
    occurredAt: event.occurredAt,
    seatCode: event.seatCode,
  }));
  const flightEvents = flightUpdatedEvents(recorded, soldOutSchedule(change.flight), 'SOLD_OUT');
  const stats = statsChangedEvent(
    summary,
    change.occurredAt,
    change.soldOut ? 'SOLD_OUT' : undefined,
  );
  return [...seatEvents, ...flightEvents, ...stats];
}
