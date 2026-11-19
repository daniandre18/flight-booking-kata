import { inject, Injectable, signal } from '@angular/core';
import type { BookingDto, CreateBookingRequest, FlightDto } from '@kata/shared';
import { isApiError } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { uuidV4 } from '../../core/uuid';

export interface CheckoutHolds {
  seatIds: string[];
  holdExpiresAt: string;
}

/**
 * Pago (HU3). La `Idempotency-Key` se genera al abrir el pago y se reutiliza en cada reintento
 * (doble clic, rechazo, red caída): el backend crea una sola reserva (RF-020, CE-007). Tras el
 * éxito se renueva para la siguiente compra.
 */
@Injectable()
export class CheckoutStore {
  private readonly api = inject(ApiService);
  private idempotencyKey = uuidV4();

  readonly flight = signal<FlightDto | null>(null);
  readonly holds = signal<CheckoutHolds | null>(null);
  readonly offsetMs = signal(0);
  readonly loading = signal(true);
  readonly processing = signal(false);
  readonly expired = signal(false);
  /** Mensaje del último rechazo, para mostrarlo junto al formulario. */
  readonly error = signal<string | null>(null);
  /** Código del último rechazo (para decidir si hay que refrescar los bloqueos). */
  readonly errorCode = signal<string | null>(null);

  /** Recupera los bloqueos vigentes al abrir o recargar el pago. */
  async load(flightId: string, options: { quiet?: boolean } = {}): Promise<void> {
    // `quiet`: refresca sin desmontar el formulario (se conserva lo escrito).
    this.loading.set(!options.quiet);
    try {
      const [flight, myHolds] = await Promise.all([
        this.api.getFlight(flightId),
        this.api.getMyHolds(flightId),
      ]);
      const group = myHolds.holds.find((candidate) => candidate.flightId === flightId);
      this.flight.set(flight);
      this.offsetMs.set(new Date(myHolds.serverNow).getTime() - Date.now());
      this.holds.set(group ? { seatIds: group.seatIds, holdExpiresAt: group.holdExpiresAt } : null);
      this.expired.set(false);
    } catch {
      this.holds.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(request: CreateBookingRequest): Promise<BookingDto | null> {
    if (this.processing()) {
      return null;
    }
    this.processing.set(true);
    this.error.set(null);
    try {
      const booking = await this.api.createBooking(request, this.idempotencyKey);
      this.idempotencyKey = uuidV4();
      return booking;
    } catch (error) {
      this.onFailure(error);
      return null;
    } finally {
      this.processing.set(false);
    }
  }

  markExpired(): void {
    this.expired.set(true);
  }

  private onFailure(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'No pudimos procesar el pago.');
    this.errorCode.set(isApiError(error) ? error.code : null);
    if (isApiError(error, 'HOLD_EXPIRED')) {
      this.expired.set(true);
    }
  }
}
