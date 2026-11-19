import type { FlightQueryPort, FlightStatusPort } from '../../../flights';
import type { SeatBookingPort } from '../../../seats';
import type { BookingLookupPort } from './booking-lookup.port';
import type { BookingStore } from './booking-store.port';
import type { IdempotencyStore } from './idempotency-store.port';
import type { PaymentGateway } from './payment-gateway.port';

/**
 * Objeto de dependencias de la confirmación (research.md §24): agrupa los puertos de cada módulo
 * que `ConfirmBookingUseCase` orquesta en una UnitOfWork, para respetar `max-params` ≤ 4.
 */
export const BOOKING_PORTS = Symbol('BookingPorts');

export interface BookingPorts {
  idempotency: IdempotencyStore;
  seats: SeatBookingPort;
  payments: PaymentGateway;
  bookings: BookingStore;
  /** Lee la reserva guardada para responder (también en la repetición idempotente). */
  lookup: BookingLookupPort;
  /** Tarifa del vuelo y vuelo de la respuesta. */
  flights: FlightQueryPort;
  flightStatus: FlightStatusPort;
}
