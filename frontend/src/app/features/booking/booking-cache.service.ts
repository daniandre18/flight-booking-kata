import { Injectable } from '@angular/core';
import type { BookingDto } from '@kata/shared';

/**
 * Reserva recién creada, solo en memoria: al recargar el boleto se pide el correo y se consulta
 * con código y correo (no se guardan datos personales en el navegador).
 */
@Injectable({ providedIn: 'root' })
export class BookingCacheService {
  private readonly bookings = new Map<string, BookingDto>();

  set(booking: BookingDto): void {
    this.bookings.set(booking.code, booking);
  }

  get(code: string): BookingDto | null {
    return this.bookings.get(code.toUpperCase()) ?? null;
  }
}
