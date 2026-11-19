import { formatSeatCode } from '@kata/shared';
import { isDelayed, type FlightView } from '../../flights';
import type {
  DomainEvent,
  FlightUpdated,
  SeatBooked,
} from '../../shared-kernel/application/event-publisher';
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
function soldOutState(flight: FlightView) {
  return {
    status: 'SOLD_OUT' as const,
    scheduledDepartureAt: flight.scheduledDepartureAt,
    departureAt: flight.departureAt,
    arrivalAt: flight.arrivalAt,
    delayed: isDelayed(flight.scheduledDepartureAt, flight.departureAt),
    change: 'SOLD_OUT' as const,
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
  const state = soldOutState(change.flight);
  const payload = {
    ...state,
    scheduledDepartureAt: state.scheduledDepartureAt.toISOString(),
    departureAt: state.departureAt.toISOString(),
    arrivalAt: state.arrivalAt.toISOString(),
  };
  return [...seatDrafts, { type: 'FLIGHT_UPDATED', seatCode: null, payload, occurredAt }];
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
  const flightEvents = recorded
    .filter((event) => event.type === 'FLIGHT_UPDATED')
    .map((event): FlightUpdated => ({
      type: 'FlightUpdated',
      flightId: event.flightId,
      seq: event.seq,
      occurredAt: event.occurredAt,
      ...soldOutState(change.flight),
    }));
  const stats = statsChangedEvent(
    summary,
    change.occurredAt,
    change.soldOut ? 'SOLD_OUT' : undefined,
  );
  return [...seatEvents, ...flightEvents, ...stats];
}
