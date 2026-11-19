import type { CardBrand } from '@kata/shared';
import type { BookedPassenger } from '../../domain/booking-policy';

/** Escritura de reservas: solo tablas del módulo (`bookings`, `booking_seats`). */
export const BOOKING_STORE = Symbol('BookingStore');

export interface NewBooking {
  flightId: string;
  clientId: string;
  buyerName: string;
  /** Ya normalizado en minúsculas. */
  buyerEmail: string;
  total: number;
  cardBrand: CardBrand;
  cardLast4: string;
  createdAt: Date;
  passengers: BookedPassenger[];
}

export interface SavedBooking {
  id: string;
  code: string;
}

export interface BookingStore {
  /** Inserta la reserva con `code`; `null` si el código ya existe (el caso de uso reintenta). */
  save(booking: NewBooking, code: string): Promise<SavedBooking | null>;
}
