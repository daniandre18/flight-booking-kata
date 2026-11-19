import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SeatStatusIconComponent } from '../../shared/ui/seat-status-icon.component';
import { SEAT_DISPLAY_LABEL, type SeatDisplay } from './seat-cell';

/** Leyenda siempre visible con color e icono de cada estado (RUX-008). */
@Component({
  selector: 'app-seat-legend',
  imports: [SeatStatusIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="legend" aria-label="Leyenda del mapa">
      @for (status of statuses; track status) {
        <li>
          <span class="swatch seat-{{ status }}"><app-seat-status-icon [status]="status" /></span>
          {{ labels[status] }}
        </li>
      }
      <li class="types">Ventana: A y F · Medio: B y E · Pasillo: C y D</li>
    </ul>
  `,
  styles: `
    .legend {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-4);
      padding: 0;
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-sm);
    }
    li {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }
    .swatch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
    }
    .types {
      color: var(--color-text-muted);
    }
    .seat-available {
      background: var(--seat-available-bg);
      color: var(--seat-available-fg);
    }
    .seat-mine {
      background: var(--seat-mine-bg);
      color: var(--seat-mine-fg);
    }
    .seat-other {
      background: repeating-linear-gradient(
        45deg,
        var(--seat-other-bg),
        var(--seat-other-bg) 4px,
        #ffe7a3 4px,
        #ffe7a3 8px
      );
      color: var(--seat-other-fg);
    }
    .seat-booked {
      background: var(--seat-booked-bg);
      color: var(--seat-booked-fg);
    }
    .seat-unavailable {
      background: var(--seat-unavailable-bg);
      color: var(--seat-unavailable-fg);
    }
  `,
})
export class SeatLegendComponent {
  protected readonly statuses: SeatDisplay[] = [
    'available',
    'mine',
    'other',
    'booked',
    'unavailable',
  ];
  protected readonly labels = SEAT_DISPLAY_LABEL;
}
