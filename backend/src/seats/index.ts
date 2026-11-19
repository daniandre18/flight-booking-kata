/**
 * API pública del módulo seats (principio IV): puertos que bookings (fase 5) y admin (fase 9)
 * usan para escribir asientos dentro de su UnitOfWork.
 */
export {
  SEAT_BOOKING_PORT,
  type MarkBookedRequest,
  type MarkBookedResult,
  type SeatBookingPort,
} from './application/ports/seat-booking.port';
export { SEAT_RELEASE_PORT, type SeatReleasePort } from './application/ports/seat-release.port';
export { SeatsModule } from './seats.module';
