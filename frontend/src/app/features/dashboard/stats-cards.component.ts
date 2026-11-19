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
        <dt>Asientos disponibles</dt>
        <dd>{{ counts().available }}<span>libres para reservar</span></dd>
      </div>
      <div class="card stat held">
        <dt>Bloqueados</dt>
        <dd>{{ counts().held }}<span>en proceso de compra</span></dd>
      </div>
      <div class="card stat booked">
        <dt>Reservados</dt>
        <dd>{{ counts().booked }}<span>ventas confirmadas</span></dd>
      </div>
      <div class="card stat occupancy">
        <dt>Ocupación actual</dt>
        <dd>{{ percent(occupancy()) }}<span>del vuelo vendido</span></dd>
      </div>
    </dl>
    <p class="total">Capacidad total: <strong>{{ counts().total }} asientos</strong></p>
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
      display: grid;
      gap: var(--space-1);
      margin: 0;
      font-size: clamp(1.75rem, 4vw, 2.25rem);
      font-weight: 850;
      font-variant-numeric: tabular-nums;
    }
    .stat dd span { color: var(--color-text-muted); font-size: var(--font-size-sm); font-weight: 500; }
    .available {
      border-top: 5px solid var(--seat-available-fg);
      background: linear-gradient(135deg, var(--color-surface), var(--seat-available-bg));
    }
    .held {
      border-top: 5px solid var(--seat-other-fg);
      background: linear-gradient(135deg, var(--color-surface), var(--seat-other-bg));
    }
    .booked {
      border-top: 5px solid var(--seat-booked-bg);
      background: linear-gradient(135deg, var(--color-surface), var(--seat-unavailable-bg));
    }
    .occupancy {
      border-top: 5px solid var(--color-primary);
      background: linear-gradient(135deg, var(--color-surface), var(--color-info-bg));
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
