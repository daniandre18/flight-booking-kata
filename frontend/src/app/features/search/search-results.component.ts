import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FlightChange, FlightDto } from '@kata/shared';
import {
  FLIGHT_STATUS_LABEL,
  formatDuration,
  formatMoney,
  formatTime,
  spokenDuration,
} from '../../shared/format';
import { IconComponent } from '../../shared/ui/icon.component';

const CHANGE_NOTICE: Record<FlightChange, string> = {
  DELAYED: 'Este vuelo se retrasó. Revisa la nueva hora de salida.',
  CANCELLED: 'Este vuelo fue cancelado. Elige otro vuelo.',
  SOLD_OUT: 'Este vuelo se agotó. Elige otro vuelo.',
};

/** Menos de este porcentaje libre: la barra pasa a "quedan pocos" (ámbar) o "casi lleno" (rojo). */
const FEW_LEFT_PERCENT = 25;
const ALMOST_FULL_PERCENT = 5;

export type AvailabilityLevel = 'plenty' | 'few' | 'almost-full';

/**
 * Resultados (RUX-022 a RUX-024) en tarjetas de 3 columnas:
 * 1. Salida → llegada unidas por una ruta con avión y la duración.
 * 2. Estado como pill y disponibilidad con barra.
 * 3. Precio destacado y botón principal.
 * CANCELADO o AGOTADO no permiten elegir asientos.
 */
@Component({
  selector: 'app-search-results',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-results.component.html',
  styleUrl: './search-results.component.scss',
})
export class SearchResultsComponent {
  readonly flights = input.required<FlightDto[]>();
  readonly notices = input<Record<string, FlightChange>>({});

  protected readonly statusLabel = FLIGHT_STATUS_LABEL;
  protected readonly changeNotice = CHANGE_NOTICE;
  protected readonly time = formatTime;
  protected readonly duration = formatDuration;
  protected readonly spokenDuration = spokenDuration;
  protected readonly money = formatMoney;

  protected selectable(flight: FlightDto): boolean {
    return flight.status === 'SCHEDULED' || flight.status === 'DELAYED';
  }

  /** Porcentaje de asientos libres (ancho de la barra). */
  protected availablePercent(flight: FlightDto): number {
    return flight.capacity === 0 ? 0 : (flight.availableSeats / flight.capacity) * 100;
  }

  protected availabilityLevel(flight: FlightDto): AvailabilityLevel {
    const percent = this.availablePercent(flight);
    if (percent < ALMOST_FULL_PERCENT) {
      return 'almost-full';
    }
    return percent < FEW_LEFT_PERCENT ? 'few' : 'plenty';
  }
}
