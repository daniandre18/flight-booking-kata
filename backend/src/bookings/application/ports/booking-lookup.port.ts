import type { CardBrand, SeatLetter } from '@kata/shared';

/** Lectura de reservas (I de SOLID: separada de `BookingStore`). */
export const BOOKING_LOOKUP_PORT = Symbol('BookingLookupPort');

export interface BookingPassengerRecord {
  row: number;
  letter: SeatLetter;
  name: string;
}

export interface BookingRecord {
  id: string;
  code: string;
  flightId: string;
  buyerName: string;
  buyerEmail: string;
  total: number;
  cardBrand: CardBrand;
  cardLast4: string;
  createdAt: Date;
  /** Ordenados por fila y letra. */
  passengers: BookingPassengerRecord[];
}

export interface BookingLookupPort {
  /** Código y correo ya normalizados; `null` si no coinciden (sin distinguir el motivo). */
  findByCodeAndEmail(code: string, email: string): Promise<BookingRecord | null>;
  findById(bookingId: string): Promise<BookingRecord | null>;
}
