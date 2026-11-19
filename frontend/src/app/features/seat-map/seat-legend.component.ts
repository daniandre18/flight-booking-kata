import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from '../../shared/ui/icon.component';
import { SeatIconComponent } from '../../shared/ui/seat-icon.component';
import { SEAT_DISPLAY_LABEL, type SeatDisplay } from './seat-cell';

/** Leyenda siempre visible con el mismo asiento SVG del mapa y su marca por estado (RUX-008). */
@Component({
  selector: 'app-seat-legend',
  imports: [IconComponent, SeatIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="legend" aria-label="Leyenda del mapa">
      @for (status of statuses; track status) {
        <li>
          <span class="swatch"><app-seat-icon [status]="status" /></span>
          {{ labels[status] }}
        </li>
      }
      <li>
        <span class="sign exit"><app-icon name="exit-right" [size]="12" /></span>
        Salida de emergencia (filas 12 y 13)
      </li>
      <li>
        <span class="sign facility"><app-icon name="restroom" [size]="14" /></span>
        Baños
      </li>
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
      margin: 0 0 var(--space-4);
      font-size: var(--font-size-sm);
    }
    li {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }
    .swatch {
      display: inline-flex;
      width: 1.9rem;
      height: 1.9rem;
    }
    .sign {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 4px;
    }
    .exit {
      background: #15803d;
      color: #fff;
    }
    .facility {
      background: #e2e8f0;
      color: var(--color-text-muted);
    }
    .types {
      color: var(--color-text-muted);
      flex-basis: 100%;
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
