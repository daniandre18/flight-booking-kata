import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { BookingDto, BookingLookupRequest } from '@kata/shared';
import { ApiService } from '../../core/api.service';
import { BookingCacheService } from './booking-cache.service';
import { BookingLookupComponent } from './booking-lookup.component';
import { BookingTicketComponent } from './booking-ticket.component';

/**
 * `/booking/:code` y `/booking`: muestra la reserva recién creada o, si se recarga, pide el correo
 * y consulta con `POST /api/bookings/lookup` (mismo 404 para código o correo incorrectos).
 */
@Component({
  selector: 'app-booking-page',
  imports: [BookingLookupComponent, BookingTicketComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (booking(); as current) {
      <h2>Tu boleto</h2>
      <app-booking-ticket [booking]="current" />
      <p><a routerLink="/search">Buscar otro vuelo</a></p>
    } @else {
      <h2>Consultar boleto</h2>
      <p>Ingresa el código de reserva y el correo con el que compraste.</p>
      <app-booking-lookup
        [initialCode]="code() ?? ''"
        [busy]="busy()"
        [error]="error()"
        (lookup)="find($event)"
      />
    }
  `,
})
export class BookingPage {
  readonly code = input<string>();
  private readonly api = inject(ApiService);
  private readonly cache = inject(BookingCacheService);
  private readonly router = inject(Router);

  private readonly cached = computed(() => {
    const code = this.code();
    return code === undefined ? null : this.cache.get(code);
  });
  protected readonly booking = linkedSignal<BookingDto | null>(() => this.cached());
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async find(request: BookingLookupRequest): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const booking = await this.api.lookupBooking(request, { silent: true });
      this.cache.set(booking);
      this.booking.set(booking);
      if (this.code() !== booking.code) {
        await this.router.navigate(['/booking', booking.code], { replaceUrl: true });
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos consultar el boleto.');
    } finally {
      this.busy.set(false);
    }
  }
}
