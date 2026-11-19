import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { BookingDto } from '@kata/shared';
import { SEAT_TYPE_LABEL, formatDate, formatMoney, formatTime } from '../../shared/format';

/** Boleto (RUX-028): código destacado, vuelo, asientos con pasajero, total, marca y últimos 4. */
@Component({
  selector: 'app-booking-ticket',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = booking();
    <article class="ticket card" aria-labelledby="ticket-code">
      <p class="label">Código de reserva</p>
      <p class="code" id="ticket-code">{{ b.code }}</p>
      <p class="notice notice-success">
        Reserva confirmada. Guarda este código: con él y tu correo puedes consultar el boleto.
      </p>
      <h3>{{ b.flight.flightNumber }} · {{ b.flight.origin }} → {{ b.flight.destination }}</h3>
      <p>
        {{ date(b.flight.departureAt) }} · Sale {{ time(b.flight.departureAt) }} · Llega
        {{ time(b.flight.arrivalAt) }}
      </p>
      <table>
        <caption class="visually-hidden">
          Asientos y pasajeros
        </caption>
        <thead>
          <tr>
            <th scope="col">Asiento</th>
            <th scope="col">Tipo</th>
            <th scope="col">Pasajero</th>
          </tr>
        </thead>
        <tbody>
          @for (passenger of b.passengers; track passenger.seatId) {
            <tr>
              <td>{{ passenger.seatId }}</td>
              <td>{{ typeLabel[passenger.type] }}</td>
              <td>{{ passenger.name }}</td>
            </tr>
          }
        </tbody>
      </table>
      <p>Comprador: {{ b.buyer.name }} ({{ b.buyer.email }})</p>
      <p>Pagado con {{ b.cardBrand }} terminada en {{ b.cardLast4 }}</p>
      <p class="total">
        Total <strong>{{ money(b.total) }}</strong>
      </p>
    </article>
  `,
  styles: `
    .ticket {
      display: grid;
      gap: var(--space-2);
      max-width: 640px;
    }
    .ticket p {
      margin: 0;
    }
    .label {
      color: var(--color-text-muted);
      font-weight: 600;
    }
    .code {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: 0.2em;
      font-family: ui-monospace, monospace;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th,
    td {
      text-align: left;
      padding: var(--space-1) var(--space-2);
      border-bottom: 1px solid var(--color-border);
    }
    .total {
      font-size: var(--font-size-lg);
    }
  `,
})
export class BookingTicketComponent {
  readonly booking = input.required<BookingDto>();
  protected readonly typeLabel = SEAT_TYPE_LABEL;
  protected readonly time = formatTime;
  protected readonly date = formatDate;
  protected readonly money = formatMoney;
}
