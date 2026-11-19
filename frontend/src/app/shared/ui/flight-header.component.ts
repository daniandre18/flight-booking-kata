import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FlightDto } from '@kata/shared';
import { FLIGHT_STATUS_LABEL, formatDate, formatMoney, formatTime } from '../format';

/** Cabecera común del vuelo (mapa, pago, tablero): ruta, horas, estado y tarifa. */
@Component({
  selector: 'app-flight-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flight-header.component.html',
  styleUrl: './flight-header.component.scss',
})
export class FlightHeaderComponent {
  readonly flight = input<FlightDto | null>(null);
  protected readonly statusLabel = FLIGHT_STATUS_LABEL;
  protected readonly time = formatTime;
  protected readonly date = formatDate;
  protected readonly money = formatMoney;
}
