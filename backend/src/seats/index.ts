/**
 * API pública del módulo seats (principio IV): puertos que bookings (fase 5) y admin (fase 9)
 * usan para escribir asientos dentro de su UnitOfWork, y la construcción única de los eventos de
 * liberación (también la usa la cancelación del vuelo).
 */
export {
  SEAT_BOOKING_PORT,
  type BookedSeat,
  type MarkBookedRequest,
  type MarkBookedResult,
  type SeatBookingPort,
} from './application/ports/seat-booking.port';
export { SEAT_RELEASE_PORT, type SeatReleasePort } from './application/ports/seat-release.port';
export { seatReleasedDrafts, seatReleasedEvents } from './application/seat-released-events';
export { SeatsModule } from './seats.module';
