import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ActivityEntryDto } from '@kata/shared';
import { FLIGHT_STATUS_LABEL, RELEASE_REASON_LABEL, formatClock } from '../../shared/format';

/** Tipo de la entrada en español a partir de `type` y `reason` (RUX-030). */
export function activityLabel(entry: ActivityEntryDto): string {
  switch (entry.type) {
    case 'SEAT_HELD':
      return 'bloqueo';
    case 'SEAT_BOOKED':
      return 'reserva';
    case 'SEAT_RELEASED':
      return RELEASE_REASON_LABEL[entry.reason ?? 'MANUAL'];
    case 'FLIGHT_UPDATED':
      return 'cambio de estado del vuelo';
  }
}

/** Registro de actividad: hora, tipo y asiento; el más reciente primero (RUX-030, RUX-031). */
@Component({
  selector: 'app-activity-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="activity-title">
      <div class="heading">
        <div>
          <p class="eyebrow">Actualización continua</p>
          <h3 id="activity-title">Actividad reciente</h3>
        </div>
        <span class="live"><span aria-hidden="true"></span>En vivo</span>
      </div>
      @if (entries().length === 0) {
        <p class="empty">Todavía no hay actividad en este vuelo.</p>
      } @else {
        <ol class="log" aria-live="polite" aria-relevant="additions">
          @for (entry of entries(); track entry.seq) {
            <li>
              <time [attr.datetime]="entry.occurredAt">{{ clock(entry.occurredAt) }}</time>
              <span class="type type-{{ entry.type }}">{{ label(entry) }}</span>
              <span>
                @if (entry.seatId) {
                  Asiento {{ entry.seatId }}
                } @else {
                  Vuelo {{ statusLabel(entry.status) }}
                }
              </span>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: `
    .log {
      list-style: none;
      padding: 0;
      margin: 0;
      max-height: 28rem;
      overflow-y: auto;
    }
    .log li {
      display: grid;
      grid-template-columns: 5.5rem 1fr auto;
      gap: var(--space-2);
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--seat-unavailable-bg);
    }
    .heading { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
    .heading h3 { margin: 0; }
    .eyebrow { margin: 0 0 var(--space-1); color: var(--color-text-muted); font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .live { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--color-success-fg); font-size: var(--font-size-sm); font-weight: 800; }
    .live span { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: currentColor; }
    time {
      font-variant-numeric: tabular-nums;
      color: var(--color-text-muted);
    }
    .type {
      width: fit-content;
      padding: 0.1rem var(--space-2);
      border-radius: 999px;
      color: var(--color-info-fg);
      background: var(--color-info-bg);
      font-size: var(--font-size-sm);
      font-weight: 700;
    }
    .type-SEAT_BOOKED { color: var(--color-success-fg); background: var(--color-success-bg); }
    .type-SEAT_RELEASED { color: var(--color-warning-fg); background: var(--color-warning-bg); }
    .type-FLIGHT_UPDATED { color: var(--color-danger-fg); background: var(--color-danger-bg); }
    .empty {
      color: var(--color-text-muted);
    }
  `,
})
export class ActivityLogComponent {
  readonly entries = input.required<ActivityEntryDto[]>();
  protected readonly clock = formatClock;
  protected readonly label = activityLabel;

  protected statusLabel(status: string): string {
    return (FLIGHT_STATUS_LABEL as Record<string, string>)[status]?.toLowerCase() ?? status;
  }
}
