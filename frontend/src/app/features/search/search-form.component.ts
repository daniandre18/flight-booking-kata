import {
  ChangeDetectionStrategy,
  Component,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  AIRPORT_CODES,
  createSearchFlightsQuerySchema,
  toBogotaDate,
  type SearchFlightsQuery,
} from '@kata/shared';
import { AIRPORT_LABEL } from '../../shared/format';
import { inputValue, validate, type FieldErrors } from '../../shared/forms';

type Field = keyof SearchFlightsQuery;

/**
 * Búsqueda por origen, destino y fecha validada con el esquema de shared (DRY): no busca con
 * campos vacíos, fecha pasada ni origen = destino, y muestra el error junto al campo (RUX-021).
 */
@Component({
  selector: 'app-search-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="card search-form" (submit)="submit($event)" novalidate aria-label="Buscar vuelos">
      <div class="field">
        <label for="origin">Origen</label>
        <select
          id="origin"
          (change)="set('origin', $event)"
          [attr.aria-invalid]="!!errors()['origin']"
          aria-describedby="origin-error"
        >
          @for (code of airports; track code) {
            <option [value]="code" [selected]="code === value().origin">{{ labels[code] }}</option>
          }
        </select>
        <span class="field-error" id="origin-error">{{ errors()['origin'] }}</span>
      </div>
      <div class="field">
        <label for="destination">Destino</label>
        <select
          id="destination"
          (change)="set('destination', $event)"
          [attr.aria-invalid]="!!errors()['destination']"
          aria-describedby="destination-error"
        >
          @for (code of airports; track code) {
            <option [value]="code" [selected]="code === value().destination">
              {{ labels[code] }}
            </option>
          }
        </select>
        <span class="field-error" id="destination-error">{{ errors()['destination'] }}</span>
      </div>
      <div class="field">
        <label for="date">Fecha</label>
        <input
          id="date"
          type="date"
          [value]="value().date"
          [min]="today"
          (input)="set('date', $event)"
          [attr.aria-invalid]="!!errors()['date']"
          aria-describedby="date-error"
          required
        />
        <span class="field-error" id="date-error">{{ errors()['date'] }}</span>
      </div>
      <button class="btn" type="submit">Buscar vuelos</button>
    </form>
  `,
  styles: `
    .search-form {
      display: grid;
      gap: 0 var(--space-4);
      grid-template-columns: 1fr;
      align-items: start;
    }
    .btn {
      margin-top: 1.75rem;
    }
    @media (min-width: 641px) {
      .search-form {
        grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
      }
    }
  `,
})
export class SearchFormComponent {
  readonly initial = input.required<SearchFlightsQuery>();
  readonly search = output<SearchFlightsQuery>();

  protected readonly airports = AIRPORT_CODES;
  protected readonly labels = AIRPORT_LABEL;
  protected readonly today = toBogotaDate(new Date());
  protected readonly value = linkedSignal<Record<Field, string>>(() => ({ ...this.initial() }));
  protected readonly errors = signal<FieldErrors>({});

  protected set(field: Field, event: Event): void {
    this.value.update((current) => ({ ...current, [field]: inputValue(event) }));
    if (Object.keys(this.errors()).length > 0) {
      this.errors.set(validate(createSearchFlightsQuerySchema(), this.value()).errors);
    }
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const result = validate(createSearchFlightsQuerySchema(), this.value());
    this.errors.set(result.errors);
    if (result.data !== null) {
      this.search.emit(result.data);
    }
  }
}
