import type { SeatPosition } from '@kata/shared';

/** Paso de bloqueos a reservas (I de SOLID). Se ejecuta dentro de la UnitOfWork de bookings. */
export const SEAT_BOOKING_PORT = Symbol('SeatBookingPort');

export interface MarkBookedRequest {
  flightId: string;
  clientId: string;
  seats: SeatPosition[];
  now: Date;
}

/** Asiento que pasó a BOOKED; `id` es la clave de `seats` que guarda `booking_seats`. */
export interface BookedSeat extends SeatPosition {
  id: string;
}

export interface MarkBookedResult {
  booked: BookedSeat[];
  /** Bloqueos vigentes del cliente en el vuelo que no estaban en la solicitud. */
  remainingActiveHolds: number;
}

export interface SeatBookingPort {
  /** UPDATE condicional HELD → BOOKED solo de los bloqueos vigentes del cliente (research.md §9). */
  markBooked(request: MarkBookedRequest): Promise<MarkBookedResult>;
}
