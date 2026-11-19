import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { BookingDto } from '@kata/shared';
import { formatDate, formatTime } from '../../shared/format';

interface QrCell {
  readonly index: number;
  readonly dark: boolean;
}

interface BoardingPassenger {
  readonly name: string;
  readonly seatId: string;
}

const QR_SIZE = 13;

/** Patrón visual determinista para identificar la reserva; no pretende ser un QR escaneable. */
function createVisualQr(value: string): QrCell[] {
  const seed = [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
  const isInsideFinder = (row: number, column: number): boolean =>
    row >= 0 && row < 5 && column >= 0 && column < 5;
  const isFinder = (row: number, column: number, startRow: number, startColumn: number): boolean => {
    const localRow = row - startRow;
    const localColumn = column - startColumn;
    if (!isInsideFinder(localRow, localColumn)) {
      return false;
    }
    const isOuterRing =
      localRow === 0 || localRow === 4 || localColumn === 0 || localColumn === 4;
    return isOuterRing || (localRow >= 1 && localRow <= 3 && localColumn >= 1 && localColumn <= 3);
  };

  return Array.from({ length: QR_SIZE * QR_SIZE }, (_, index) => {
    const row = Math.floor(index / QR_SIZE);
    const column = index % QR_SIZE;
    const finder =
      isFinder(row, column, 0, 0) ||
      isFinder(row, column, 0, QR_SIZE - 5) ||
      isFinder(row, column, QR_SIZE - 5, 0);
    return { index, dark: finder || (seed + row * 17 + column * 11 + index) % 5 < 2 };
  });
}

/** Pase de abordar digital para una reserva confirmada. */
@Component({
  selector: 'app-booking-ticket',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = booking();
    @let passenger = primaryPassenger();
    <article class="boarding-pass" aria-labelledby="boarding-pass-title">
      <section class="pass-main">
        <header class="pass-header">
          <p class="eyebrow">Flight Booking Airlines</p>
          <p class="pass-kind"><span aria-hidden="true">●</span> Confirmado</p>
        </header>

        <div class="pass-content">
          <div class="route" aria-label="Ruta del vuelo">
            <div>
              <span class="airport-label">Origen</span>
              <strong>{{ b.flight.origin }}</strong>
            </div>
            <span class="route-line" aria-hidden="true">✈</span>
            <div>
              <span class="airport-label">Destino</span>
              <strong>{{ b.flight.destination }}</strong>
            </div>
          </div>

          <div class="flight-details">
            <div>
              <span>Pasajero</span>
              <strong id="boarding-pass-title">{{ passenger.name }}</strong>
            </div>
            <div>
              <span>Fecha</span>
              <strong>{{ date(b.flight.departureAt) }}</strong>
            </div>
            <div>
              <span>Salida</span>
              <strong>{{ time(b.flight.departureAt) }}</strong>
            </div>
            <div>
              <span>Vuelo</span>
              <strong>{{ b.flight.flightNumber }}</strong>
            </div>
          </div>

          @if (b.passengers.length > 1) {
            <p class="companions">
              Esta reserva incluye {{ b.passengers.length - 1 }} pasajero(s) adicional(es):
              @for (person of b.passengers.slice(1); track person.seatId; let last = $last) {
                {{ person.name }}{{ last ? '' : ', ' }}
              }
            </p>
          }
        </div>
      </section>

      <aside class="pass-stub" aria-label="Talón de abordaje">
        <p class="stub-label">Asiento</p>
        <strong class="seat">{{ passenger.seatId }}</strong>
        @if (b.passengers.length > 1) {
          <span class="more-seats">+{{ b.passengers.length - 1 }} asiento(s)</span>
        }

        <p class="stub-label">Reserva</p>
        <strong class="booking-code">{{ b.code }}</strong>

        <div class="qr" [attr.aria-label]="'Código visual de la reserva ' + b.code">
          @for (cell of qrCells(); track cell.index) {
            <i [class.dark]="cell.dark"></i>
          }
        </div>
        <span class="qr-caption">Presenta este pase al abordar</span>
      </aside>

      <footer class="pass-actions">
        <button class="btn" type="button" (click)="downloadPdf()">Descargar PDF</button>
        <button class="btn btn-secondary" type="button" (click)="newLookup.emit()">
          Nueva consulta
        </button>
      </footer>
    </article>
  `,
  styles: `
    :host { display: block; max-width: 720px; }
    .boarding-pass {
      display: grid;
      grid-template-columns: minmax(0, 7fr) minmax(210px, 3fr);
      overflow: hidden;
      color: var(--navy-900);
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-float);
    }
    .pass-main {
      position: relative;
      min-width: 0;
      border-right: 2px dashed #cbd5e1;
    }
    .pass-main::before, .pass-main::after {
      position: absolute;
      z-index: 1;
      right: -0.8rem;
      width: 1.5rem;
      height: 1.5rem;
      content: '';
      background: var(--color-bg);
      border-radius: 50%;
    }
    .pass-main::before { top: -0.75rem; }
    .pass-main::after { bottom: -0.75rem; }
    .pass-header, .pass-actions { display: flex; align-items: center; gap: var(--space-3); }
    .pass-header {
      justify-content: space-between;
      padding: var(--space-3) var(--space-6);
      color: var(--on-navy);
      background: var(--navy-900);
      font-size: var(--font-size-sm);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .eyebrow, .pass-kind, .companions, .stub-label, .qr-caption { margin: 0; }
    .pass-kind { color: #86efac; font-weight: 800; }
    .pass-content { padding: var(--space-6); }
    .route {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: var(--space-4);
      align-items: center;
      margin: var(--space-4) 0 var(--space-6);
    }
    .route > div:last-child { text-align: right; }
    .airport-label, .flight-details span, .stub-label {
      display: block;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .route strong {
      display: block;
      margin-top: var(--space-1);
      font-size: clamp(2.5rem, 10vw, 3.75rem);
      line-height: 1;
      letter-spacing: -0.06em;
    }
    .route-line {
      display: grid;
      width: 2.75rem;
      height: 2.75rem;
      place-items: center;
      border-radius: 50%;
      color: var(--color-on-primary);
      background: var(--color-primary);
      font-size: 1.25rem;
    }
    .flight-details {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .flight-details strong { display: block; margin-top: var(--space-1); font-size: var(--font-size-lg); }
    .companions { margin-top: var(--space-4); color: var(--color-text-muted); font-size: var(--font-size-sm); }
    .pass-stub {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-8) var(--space-4);
      text-align: center;
      color: var(--navy-900);
      background: var(--color-surface);
    }
    .seat { margin: var(--space-1) 0; font-size: 4rem; line-height: 1; letter-spacing: -0.08em; }
    .more-seats { margin-bottom: var(--space-6); color: var(--color-text-muted); font-size: var(--font-size-sm); }
    .booking-code {
      margin: var(--space-1) 0 var(--space-4);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 1.4rem;
      letter-spacing: 0.12em;
    }
    .qr {
      display: grid;
      grid-template-columns: repeat(13, 1fr);
      width: 8rem;
      aspect-ratio: 1;
      padding: 0.35rem;
      background: var(--color-surface);
    }
    .qr i { display: block; background: transparent; }
    .qr i.dark { background: var(--navy-900); }
    .qr-caption { margin-top: var(--space-3); color: var(--color-text-muted); font-size: 0.75rem; }
    .pass-actions {
      grid-column: 1 / -1;
      padding: var(--space-4) var(--space-8);
      border-top: 1px solid var(--color-border);
      background: var(--color-bg);
      justify-content: flex-end;
    }
    @media (max-width: 680px) {
      .boarding-pass { grid-template-columns: 1fr; }
      .pass-main {
        border-right: 0;
        border-bottom: 2px dashed #cbd5e1;
      }
      .pass-main::before, .pass-main::after { top: auto; bottom: -0.8rem; }
      .pass-main::before { left: -0.75rem; right: auto; }
      .pass-main::after { right: -0.75rem; }
      .flight-details { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .pass-stub {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2);
        align-items: center;
        padding: var(--space-6);
      }
      .seat, .booking-code, .more-seats, .qr-caption { margin: 0; }
      .qr { grid-row: span 2; justify-self: center; }
      .pass-actions { padding: var(--space-4) var(--space-6); }
    }
    @media print {
      .boarding-pass { box-shadow: none; border: 1px solid var(--color-border); }
      .pass-actions { display: none; }
    }
  `,
})
export class BookingTicketComponent {
  readonly booking = input.required<BookingDto>();
  readonly newLookup = output<void>();
  protected readonly primaryPassenger = computed<BoardingPassenger>(() => {
    const booking = this.booking();
    return booking.passengers[0] ?? { name: booking.buyer.name, seatId: '—' };
  });
  protected readonly qrCells = computed(() => createVisualQr(this.booking().code));
  protected readonly time = formatTime;
  protected readonly date = formatDate;

  protected downloadPdf(): void {
    window.print();
  }
}
