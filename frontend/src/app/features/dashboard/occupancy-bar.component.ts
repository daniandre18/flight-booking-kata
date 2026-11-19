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
  template: `
    <div
      class="bar"
      role="meter"
      aria-label="Ocupación del vuelo"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="occupancy()"
      [attr.aria-valuetext]="text()"
    >
      <span class="booked" [style.width.%]="width().booked"></span>
      <span class="held" [style.width.%]="width().held"></span>
    </div>
    <p class="caption">{{ text() }}</p>
  `,
  styles: `
    .bar {
      display: flex;
      height: 1.5rem;
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: var(--seat-available-bg);
      border: 1px solid var(--color-border);
      margin-top: var(--space-4);
    }
    .booked {
      background: var(--seat-booked-bg);
      transition: width 300ms ease;
    }
    .held {
      background: repeating-linear-gradient(
        45deg,
        var(--seat-other-fg),
        var(--seat-other-fg) 4px,
        var(--seat-other-bg) 4px,
        var(--seat-other-bg) 8px
      );
      transition: width 300ms ease;
    }
    .caption {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @media (prefers-reduced-motion: reduce) {
      .booked,
      .held {
        transition: none;
      }
    }
  `,
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
