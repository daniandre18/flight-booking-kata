import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FlightChange, FlightDto } from '@kata/shared';
import { FLIGHT_STATUS_LABEL, formatDuration, formatMoney, formatTime } from '../../shared/format';

const CHANGE_NOTICE: Record<FlightChange, string> = {
  DELAYED: 'Este vuelo se retrasó. Revisa la nueva hora de salida.',
  CANCELLED: 'Este vuelo fue cancelado. Elige otro vuelo.',
  SOLD_OUT: 'Este vuelo se agotó. Elige otro vuelo.',
};

/**
 * Resultados (RUX-022 a RUX-024): salida, llegada, duración, tarifa, estado con texto, asientos
 * disponibles y aviso de retraso con la nueva hora. CANCELADO o AGOTADO no permiten elegir asientos.
 */
@Component({
  selector: 'app-search-results',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (flights().length === 0) {
      <div class="card empty" role="status">
        <h2>No hay vuelos para esta búsqueda</h2>
        <p>
          No encontramos vuelos entre esas ciudades en esa fecha. Prueba con otra fecha u otra ruta.
        </p>
      </div>
    } @else {
      <ul class="results" aria-label="Vuelos encontrados">
        @for (flight of flights(); track flight.id) {
          <li class="card result" [class.closed]="!selectable(flight)">
            <div class="times">
              <span class="time">{{ time(flight.departureAt) }}</span>
              <span aria-hidden="true">→</span>
              <span class="time">{{ time(flight.arrivalAt) }}</span>
              <span class="visually-hidden">
                Sale a las {{ time(flight.departureAt) }} y llega a las
                {{ time(flight.arrivalAt) }}.
              </span>
            </div>
            <div class="meta">
              <span>{{ flight.flightNumber }}</span>
              <span>{{ duration(flight.durationMinutes) }}</span>
              <span class="fare">{{ money(flight.fare) }}</span>
            </div>
            <div class="status-line">
              <span class="status status-{{ flight.status }}">{{
                statusLabel[flight.status]
              }}</span>
              <span>{{ flight.availableSeats }} de {{ flight.capacity }} asientos disponibles</span>
            </div>
            @if (flight.delayed && flight.status !== 'CANCELLED') {
              <p class="notice notice-warning">
                Nueva salida: {{ time(flight.departureAt) }} (antes
                {{ time(flight.scheduledDepartureAt) }})
              </p>
            }
            @if (notices()[flight.id]; as change) {
              <p class="notice notice-info" role="status">{{ changeNotice[change] }}</p>
            }
            <div class="actions">
              @if (selectable(flight)) {
                <a class="btn" [routerLink]="['/flights', flight.id, 'seats']">
                  Elegir asientos<span class="visually-hidden">
                    del vuelo {{ flight.flightNumber }}</span
                  >
                </a>
              } @else {
                <span class="unavailable">No se pueden elegir asientos</span>
              }
              <a class="btn btn-secondary" [routerLink]="['/flights', flight.id, 'dashboard']">
                Ver ocupación<span class="visually-hidden">
                  del vuelo {{ flight.flightNumber }}</span
                >
              </a>
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .results {
      list-style: none;
      padding: 0;
      margin: var(--space-4) 0 0;
      display: grid;
      gap: var(--space-3);
    }
    .result {
      display: grid;
      gap: var(--space-2);
    }
    .closed {
      opacity: 0.85;
    }
    .times {
      display: flex;
      gap: var(--space-2);
      font-size: var(--font-size-lg);
      font-weight: 700;
    }
    .meta,
    .status-line,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-4);
      align-items: center;
    }
    .fare {
      font-weight: 700;
    }
    .status {
      font-weight: 700;
      padding: 0 var(--space-2);
      border-radius: var(--radius-sm);
    }
    .status-SCHEDULED {
      background: var(--color-success-bg);
      color: var(--color-success-fg);
    }
    .status-DELAYED {
      background: var(--color-warning-bg);
      color: var(--color-warning-fg);
    }
    .status-CANCELLED {
      background: var(--color-danger-bg);
      color: var(--color-danger-fg);
    }
    .status-SOLD_OUT {
      background: var(--seat-unavailable-bg);
      color: var(--seat-unavailable-fg);
    }
    .btn {
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }
    .unavailable {
      color: var(--color-text-muted);
    }
    .empty {
      margin-top: var(--space-4);
    }
  `,
})
export class SearchResultsComponent {
  readonly flights = input.required<FlightDto[]>();
  readonly notices = input<Record<string, FlightChange>>({});

  protected readonly statusLabel = FLIGHT_STATUS_LABEL;
  protected readonly changeNotice = CHANGE_NOTICE;
  protected readonly time = formatTime;
  protected readonly duration = formatDuration;
  protected readonly money = formatMoney;

  protected selectable(flight: FlightDto): boolean {
    return flight.status === 'SCHEDULED' || flight.status === 'DELAYED';
  }
}
