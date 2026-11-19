import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { CreateBookingRequest } from '@kata/shared';
import { formatMoney } from '../../shared/format';
import { CountdownComponent } from '../../shared/ui/countdown.component';
import { FlightHeaderComponent } from '../../shared/ui/flight-header.component';
import { BookingCacheService } from '../booking/booking-cache.service';
import { CheckoutFormComponent } from './checkout-form.component';
import { CheckoutStore } from './checkout.store';

/**
 * `/checkout?flight=<id>`: recupera los bloqueos al recargar, muestra la cuenta regresiva
 * (RUX-026), maneja 402, 410, 422 y 429 con la opción de volver al mapa y navega al boleto.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [CheckoutFormComponent, CountdownComponent, FlightHeaderComponent, RouterLink],
  providers: [CheckoutStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="['/flights', flight(), 'seats']">← Volver al mapa de asientos</a>
    <h2>Pago</h2>
    <app-flight-header [flight]="store.flight()" />
    @if (store.loading()) {
      <p role="status">Recuperando tus asientos…</p>
    } @else if (store.expired()) {
      <div class="notice notice-warning" role="alert">
        <p>Tu tiempo para pagar terminó y los asientos se liberaron.</p>
        <a [routerLink]="['/flights', flight(), 'seats']">Volver al mapa para elegirlos de nuevo</a>
      </div>
    } @else if (holds(); as current) {
      <div class="summary card">
        <p>
          Asientos: <strong>{{ current.seatIds.join(', ') }}</strong> · Total
          <strong>{{ total() }}</strong>
        </p>
        <div class="timer">
          Tiempo para pagar
          <app-countdown
            [expiresAt]="current.holdExpiresAt"
            [offsetMs]="store.offsetMs()"
            (expired)="store.markExpired()"
          />
        </div>
      </div>
      @if (store.error(); as message) {
        <div class="notice notice-danger" role="alert">
          <p>{{ message }}</p>
          <a [routerLink]="['/flights', flight(), 'seats']">Volver al mapa de asientos</a>
        </div>
      }
      <app-checkout-form
        [flightId]="flight()"
        [seatIds]="current.seatIds"
        [processing]="store.processing()"
        (submitted)="pay($event)"
      />
    } @else {
      <div class="notice notice-info" role="status">
        <p>No tienes asientos bloqueados en este vuelo.</p>
        <a [routerLink]="['/flights', flight(), 'seats']">Elegir asientos</a>
      </div>
    }
  `,
  styles: `
    .summary {
      margin-bottom: var(--space-4);
      display: grid;
      gap: var(--space-2);
    }
    .summary p {
      margin: 0;
    }
    .timer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    :host {
      display: block;
      max-width: 640px;
    }
  `,
})
export class CheckoutPage implements OnInit {
  readonly flight = input.required<string>();
  protected readonly store = inject(CheckoutStore);
  private readonly cache = inject(BookingCacheService);
  private readonly router = inject(Router);

  protected readonly holds = this.store.holds;
  protected readonly total = computed(() => {
    const fare = this.store.flight()?.fare ?? 0;
    return formatMoney(fare * (this.holds()?.seatIds.length ?? 0));
  });

  ngOnInit(): void {
    void this.store.load(this.flight());
  }

  protected async pay(request: CreateBookingRequest): Promise<void> {
    const booking = await this.store.submit(request);
    if (booking !== null) {
      this.cache.set(booking);
      await this.router.navigate(['/booking', booking.code]);
    } else if (this.store.errorCode() === 'PASSENGERS_MISMATCH') {
      // Los bloqueos cambiaron (por ejemplo, desde otra pestaña): se refrescan sin perder lo escrito.
      await this.store.load(this.flight(), { quiet: true });
    }
  }
}
