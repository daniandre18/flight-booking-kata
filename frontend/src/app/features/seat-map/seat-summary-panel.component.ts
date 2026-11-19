import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { SeatType } from '@kata/shared';
import { SEAT_TYPE_LABEL, formatMoney } from '../../shared/format';
import { CountdownComponent } from '../../shared/ui/countdown.component';

export interface SummarySeat {
  seatId: string;
  type: SeatType;
  price: number;
}

/**
 * Panel de resumen sticky (RUX-011 a RUX-015, RUX-033): asientos, precio, total, cuenta regresiva
 * y botón de pago habilitado solo con bloqueos vigentes. A la derecha en escritorio y abajo en
 * pantallas de 640 px o menos.
 */
@Component({
  selector: 'app-seat-summary-panel',
  imports: [CountdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel card" aria-labelledby="summary-title">
      <h2 id="summary-title">Tu selección</h2>
      @if (closedReason(); as reason) {
        <p class="notice notice-danger" role="alert">{{ reason }}</p>
      }
      @if (timedOut()) {
        <p class="notice notice-warning" role="alert">
          Tu tiempo terminó y los asientos se liberaron. Elige asientos de nuevo para continuar.
        </p>
      } @else if (seats().length === 0) {
        <p class="empty">Aún no has elegido asientos. Selecciona hasta 4 en el mapa.</p>
      } @else {
        <ul class="seats">
          @for (seat of seats(); track seat.seatId) {
            <li>
              <span class="code">{{ seat.seatId }}</span>
              <span class="type">{{ typeLabel[seat.type] }}</span>
              <span class="price">{{ money(seat.price) }}</span>
              <button
                type="button"
                class="link"
                (click)="release.emit(seat.seatId)"
                [disabled]="busy()"
              >
                Quitar<span class="visually-hidden"> el asiento {{ seat.seatId }}</span>
              </button>
            </li>
          }
        </ul>
        <p class="total">
          <span>Total</span> <strong>{{ money(total()) }}</strong>
        </p>
        <div class="timer">
          <span>Tiempo para pagar</span>
          <app-countdown
            [expiresAt]="expiresAt()"
            [offsetMs]="offsetMs()"
            (expired)="onExpired()"
          />
        </div>
      }
      <button type="button" class="btn pay" [disabled]="!canPay()" (click)="pay.emit()">
        Continuar al pago
      </button>
    </section>
  `,
  styles: `
    :host {
      display: block;
      position: sticky;
      top: var(--space-4);
    }
    .seats {
      list-style: none;
      padding: 0;
      margin: 0 0 var(--space-3);
      display: grid;
      gap: var(--space-2);
    }
    .seats li {
      display: grid;
      grid-template-columns: 3rem 1fr auto auto;
      gap: var(--space-2);
      align-items: center;
    }
    .code {
      font-weight: 700;
    }
    .type {
      color: var(--color-text-muted);
    }
    .total {
      display: flex;
      justify-content: space-between;
      font-size: var(--font-size-lg);
      border-top: 1px solid var(--color-border);
      padding-top: var(--space-2);
    }
    .timer {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin-bottom: var(--space-3);
    }
    .pay {
      width: 100%;
    }
    .link {
      background: none;
      border: none;
      color: var(--color-primary);
      text-decoration: underline;
      cursor: pointer;
      font: inherit;
      min-height: 2.75rem;
    }
    .empty {
      color: var(--color-text-muted);
    }
    @media (max-width: 640px) {
      :host {
        position: sticky;
        top: auto;
        bottom: 0;
        z-index: 5;
      }
      .panel {
        border-radius: var(--radius-md) var(--radius-md) 0 0;
        box-shadow: 0 -2px 8px rgb(0 0 0 / 0.15);
        max-height: 50vh;
        overflow-y: auto;
      }
    }
  `,
})
export class SeatSummaryPanelComponent {
  readonly seats = input<SummarySeat[]>([]);
  readonly expiresAt = input<string | null>(null);
  readonly offsetMs = input(0);
  readonly busy = input(false);
  readonly closedReason = input<string | null>(null);
  readonly pay = output<void>();
  readonly release = output<string>();
  readonly expired = output<void>();

  protected readonly typeLabel = SEAT_TYPE_LABEL;
  protected readonly money = formatMoney;
  /** Se reinicia cuando cambia el vencimiento (por ejemplo, al bloquear de nuevo). */
  protected readonly timedOut = linkedSignal({ source: this.expiresAt, computation: () => false });
  protected readonly total = computed(() =>
    this.seats().reduce((sum, seat) => sum + seat.price, 0),
  );
  protected readonly canPay = computed(
    () =>
      this.seats().length > 0 && !this.timedOut() && !this.busy() && this.closedReason() === null,
  );

  protected onExpired(): void {
    this.timedOut.set(true);
    this.expired.emit();
  }
}
