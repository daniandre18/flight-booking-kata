import type { SeatPosition } from '@kata/shared';

/** Paso de bloqueos a reservas (I de SOLID). Lo implementa la fase 5. */
export const SEAT_BOOKING_PORT = Symbol('SeatBookingPort');

export interface MarkBookedRequest {
  flightId: string;
  clientId: string;
  seats: SeatPosition[];
  now: Date;
}

export interface MarkBookedResult {
  bookedSeatIds: string[];
  /** Bloqueos vigentes del cliente en el vuelo que no estaban en la solicitud. */
  remainingActiveHolds: number;
}

export interface SeatBookingPort {
  markBooked(request: MarkBookedRequest): Promise<MarkBookedResult>;
}
