import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SEAT_LETTERS, SEAT_ROWS, formatSeatCode } from '@kata/shared';
import { SEAT_TYPE_LABEL, formatMoney } from '../../shared/format';
import { SeatStatusIconComponent } from '../../shared/ui/seat-status-icon.component';
import { SEAT_DISPLAY_LABEL, type SeatCell } from './seat-cell';

interface SeatRow {
  row: number;
  left: SeatCell[];
  right: SeatCell[];
}

const MOVES: Record<string, (row: number, col: number) => [number, number]> = {
  ArrowLeft: (row, col) => [row, col - 1],
  ArrowRight: (row, col) => [row, col + 1],
  ArrowUp: (row, col) => [row - 1, col],
  ArrowDown: (row, col) => [row + 1, col],
  Home: (row) => [row, 0],
  End: (row) => [row, SEAT_LETTERS.length - 1],
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Mapa con forma de cabina (RUX-001 a RUX-010, RUX-016, RUX-017, RUX-032): CSS Grid de botones,
 * sin `innerHTML`, A B C · pasillo · D E F, filas numeradas a ambos lados y frente arriba. Roving
 * tabindex con flechas; Enter o Espacio bloquean o liberan. Solo emite: la lógica está en el store.
 */
@Component({
  selector: 'app-seat-map',
  imports: [NgTemplateOutlet, SeatStatusIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seat-map.component.html',
  styleUrl: './seat-map.component.scss',
})
export class SeatMapComponent {
  readonly seats = input.required<SeatCell[]>();
  /** Motivo si el vuelo está cancelado o agotado (RUX-007). */
  readonly disabledReason = input<string | null>(null);
  /** Resincronizando o reconectando: sin acciones (RUX-019). */
  readonly busy = input(false);
  /** Asientos que cambiaron por otra persona hace un momento (RUX-016). */
  readonly highlighted = input<ReadonlySet<string>>(new Set());
  readonly toggle = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly active = signal('1A');
  protected readonly rows = computed<SeatRow[]>(() => {
    const rows: SeatRow[] = [];
    for (const seat of this.seats()) {
      const current = rows[seat.row - 1] ?? { row: seat.row, left: [], right: [] };
      rows[seat.row - 1] = current;
      (SEAT_LETTERS.indexOf(seat.letter) < 3 ? current.left : current.right).push(seat);
    }
    return rows.filter(Boolean);
  });

  protected label(seat: SeatCell): string {
    return `Asiento ${seat.seatId}, ${SEAT_TYPE_LABEL[seat.type]}, ${SEAT_DISPLAY_LABEL[seat.display]}`;
  }

  protected tooltip(seat: SeatCell): string {
    return `${seat.seatId} · ${SEAT_TYPE_LABEL[seat.type]} · ${formatMoney(seat.price)} · ${SEAT_DISPLAY_LABEL[seat.display]}`;
  }

  protected locked(): boolean {
    return this.busy() || this.disabledReason() !== null;
  }

  protected activate(seat: SeatCell): void {
    this.active.set(seat.seatId);
    if (!this.locked() && (seat.display === 'available' || seat.display === 'mine')) {
      this.toggle.emit(seat.seatId);
    }
  }

  protected onKeydown(event: KeyboardEvent, seat: SeatCell): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.activate(seat);
      return;
    }
    const move = MOVES[event.key];
    if (move === undefined) {
      return;
    }
    event.preventDefault();
    const [row, col] = move(seat.row, SEAT_LETTERS.indexOf(seat.letter));
    const target = formatSeatCode(clamp(row, 1, SEAT_ROWS), SEAT_LETTERS[clamp(col, 0, 5)] ?? 'A');
    this.active.set(target);
    this.host.nativeElement
      .querySelector<HTMLButtonElement>(`button[data-seat="${target}"]`)
      ?.focus();
  }

  /** El clic de Espacio llega en keyup; ya se atendió en keydown. */
  protected onKeyup(event: KeyboardEvent): void {
    if (event.key === ' ') {
      event.preventDefault();
    }
  }
}
