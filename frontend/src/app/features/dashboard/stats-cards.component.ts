import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SeatCounts } from '@kata/shared';
import { formatPercent } from '../../shared/format';

/** Contadores de disponibles, bloqueados y reservados, más la ocupación (RUX-029). */
@Component({
  selector: 'app-stats-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats-cards.component.html',
  styleUrl: './stats-cards.component.scss',
})
export class StatsCardsComponent {
  readonly counts = input.required<SeatCounts>();
  readonly occupancy = input.required<number>();
  protected readonly percent = formatPercent;
}
