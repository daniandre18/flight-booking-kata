import type { FlightQueryPort, FlightView } from '../../flights';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import type { BookingRecord } from './ports/booking-lookup.port';

/** Reserva con su vuelo: lo que responden la confirmación, su repetición y la consulta. */
export interface BookingView {
  booking: BookingRecord;
  flight: FlightView;
}

/** Mismo mensaje si el código o el correo no coinciden: no revela qué dato falló (RF-021). */
export const BOOKING_NOT_FOUND_MESSAGE = 'No encontramos una reserva con ese código y correo';

/** Única composición reserva + vuelo (DRY): la usan la confirmación y la consulta. */
export async function loadBookingView(
  flights: FlightQueryPort,
  record: BookingRecord | null,
  now: Date,
): Promise<BookingView> {
  const flight = record === null ? null : await flights.getById(record.flightId, now);
  if (record === null || flight === null) {
    throw new DomainError('BOOKING_NOT_FOUND', BOOKING_NOT_FOUND_MESSAGE);
  }
  return { booking: record, flight };
}
