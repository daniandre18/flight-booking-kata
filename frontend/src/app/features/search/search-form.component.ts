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
import { IconComponent } from '../../shared/ui/icon.component';

type Field = keyof SearchFlightsQuery;

/**
 * Búsqueda por origen, destino y fecha validada con el esquema de shared (DRY): no busca con
 * campos vacíos, fecha pasada ni origen = destino, y muestra el error junto al campo (RUX-021).
 */
@Component({
  selector: 'app-search-form',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="search-card" (submit)="submit($event)" novalidate aria-label="Buscar vuelos">
      <div class="field">
        <label for="origin">Origen</label>
        <div class="control">
          <app-icon class="lead-icon" name="plane-takeoff" />
          <select
            id="origin"
            (change)="set('origin', $event)"
            [attr.aria-invalid]="!!errors()['origin']"
            aria-describedby="origin-error"
          >
            @for (code of airports; track code) {
              <option [value]="code" [selected]="code === value().origin">
                {{ labels[code] }}
              </option>
            }
          </select>
        </div>
        <span class="field-error" id="origin-error">{{ errors()['origin'] }}</span>
      </div>
      <div class="field">
        <label for="destination">Destino</label>
        <div class="control">
          <app-icon class="lead-icon" name="plane-landing" />
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
        </div>
        <span class="field-error" id="destination-error">{{ errors()['destination'] }}</span>
      </div>
      <div class="field">
        <label for="date">Fecha</label>
        <div class="control">
          <app-icon class="lead-icon" name="calendar" />
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
        </div>
        <span class="field-error" id="date-error">{{ errors()['date'] }}</span>
      </div>
      <button class="btn submit" type="submit">
        <app-icon name="search" [size]="18" />
        Buscar vuelos
      </button>
    </form>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      z-index: 1;
      /* Flota sobre el borde inferior del banner (el hero deja 6,5 rem de espacio). */
      margin-top: -4.5rem;
    }
    .search-card {
      display: grid;
      gap: 0 var(--space-4);
      grid-template-columns: 1fr;
      align-items: start;
      padding: var(--space-6);
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-float);
      border: 1px solid rgb(7 22 51 / 0.06);
    }
    .field {
      margin-bottom: var(--space-2);
    }
    .field label {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .control {
      position: relative;
    }
    .lead-icon {
      position: absolute;
      left: var(--space-3);
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-primary);
      pointer-events: none;
    }
    .control select,
    .control input {
      width: 100%;
      min-height: 3rem;
      padding-left: 2.75rem;
      border-radius: 12px;
      border: 1px solid var(--color-border);
      background-color: var(--color-bg);
      font-weight: 600;
      transition:
        border-color 150ms ease,
        box-shadow 150ms ease,
        background-color 150ms ease;
    }
    .control select:hover,
    .control input:hover {
      background-color: var(--color-surface);
    }
    .control select:focus-visible,
    .control input:focus-visible {
      outline: none;
      border-color: var(--color-primary);
      background-color: var(--color-surface);
      box-shadow: 0 0 0 4px rgb(11 87 208 / 0.18);
    }
    .submit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      min-height: 3rem;
      margin-top: 1.6rem;
      padding-inline: var(--space-6);
      border-radius: 12px;
      box-shadow: 0 8px 18px -8px rgb(11 87 208 / 0.6);
    }
    @media (min-width: 641px) {
      .search-card {
        grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
      }
    }
    @media (max-width: 640px) {
      :host {
        margin-top: -4rem;
      }
      .search-card {
        padding: var(--space-4);
      }
      .submit {
        margin-top: var(--space-2);
        width: 100%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .control select,
      .control input {
        transition: none;
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
