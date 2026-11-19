import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SeatCounts } from '@kata/shared';
import { formatPercent } from '../../shared/format';

/**
 * Barra de ocupación proporcional y accesible (RUX-029): segmentos reservados, bloqueados y
 * disponibles con texto, y un `meter` que el lector de pantalla anuncia con su valor.
 */
@Component({
  selector: 'app-occupancy-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './occupancy-bar.component.html',
  styleUrl: './occupancy-bar.component.scss',
})
export class OccupancyBarComponent {
  readonly counts = input.required<SeatCounts>();
  readonly occupancy = input.required<number>();

  protected readonly width = computed(() => {
    const { booked, held, total } = this.counts();
    return total === 0
      ? { booked: 0, held: 0 }
      : { booked: (booked / total) * 100, held: (held / total) * 100 };
  });

  protected readonly text = computed(() => {
    const { booked, held, available } = this.counts();
    return `${formatPercent(this.occupancy())} ocupado: ${booked} reservados, ${held} bloqueados y ${available} disponibles`;
  });
}
