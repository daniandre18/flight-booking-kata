import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FlightDto } from '@kata/shared';
import { FLIGHT_STATUS_LABEL, formatDate, formatMoney, formatTime } from '../format';

/** Cabecera común del vuelo (mapa, pago, tablero): ruta, horas, estado y tarifa. */
@Component({
  selector: 'app-flight-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (flight(); as f) {
      <div class="flight-header">
        <h2>{{ f.flightNumber }} · {{ f.origin }} → {{ f.destination }}</h2>
        <p>
          {{ date(f.departureAt) }} · Sale {{ time(f.departureAt) }} · Llega
          {{ time(f.arrivalAt) }} ·
          <strong class="status-{{ f.status }}">{{ statusLabel[f.status] }}</strong> · Tarifa
          {{ money(f.fare) }} por asiento
        </p>
        @if (f.delayed && f.status !== 'CANCELLED') {
          <p class="notice notice-warning" role="status">
            Vuelo retrasado: salía a las {{ time(f.scheduledDepartureAt) }}, ahora sale a las
            {{ time(f.departureAt) }}.
          </p>
        }
      </div>
    }
  `,
  styles: `
    .flight-header p {
      margin: 0 0 var(--space-2);
    }
    .status-CANCELLED {
      color: var(--color-danger-fg);
    }
    .status-DELAYED {
      color: var(--color-warning-fg);
    }
  `,
})
export class FlightHeaderComponent {
  readonly flight = input<FlightDto | null>(null);
  protected readonly statusLabel = FLIGHT_STATUS_LABEL;
  protected readonly time = formatTime;
  protected readonly date = formatDate;
  protected readonly money = formatMoney;
}
