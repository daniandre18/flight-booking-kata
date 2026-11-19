import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SeatCounts } from '@kata/shared';
import { formatPercent } from '../../shared/format';

/** Contadores de disponibles, bloqueados y reservados, más la ocupación (RUX-029). */
@Component({
  selector: 'app-stats-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="cards">
      <div class="card stat available">
        <dt>Disponibles</dt>
        <dd>{{ counts().available }}</dd>
      </div>
      <div class="card stat held">
        <dt>Bloqueados</dt>
        <dd>{{ counts().held }}</dd>
      </div>
      <div class="card stat booked">
        <dt>Reservados</dt>
        <dd>{{ counts().booked }}</dd>
      </div>
      <div class="card stat">
        <dt>Ocupación</dt>
        <dd>{{ percent(occupancy()) }}</dd>
      </div>
    </dl>
    <p class="total">Total: {{ counts().total }} asientos</p>
  `,
  styles: `
    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      margin: 0;
    }
    @media (min-width: 641px) {
      .cards {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
    .stat dt {
      font-weight: 600;
      color: var(--color-text-muted);
    }
    .stat dd {
      margin: 0;
      font-size: var(--font-size-xl);
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .available {
      border-left: 6px solid var(--seat-available-fg);
    }
    .held {
      border-left: 6px solid var(--seat-other-fg);
    }
    .booked {
      border-left: 6px solid var(--seat-booked-bg);
    }
    .total {
      color: var(--color-text-muted);
    }
  `,
})
export class StatsCardsComponent {
  readonly counts = input.required<SeatCounts>();
  readonly occupancy = input.required<number>();
  protected readonly percent = formatPercent;
}
