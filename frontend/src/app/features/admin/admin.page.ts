import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  signal,
  type OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AIRPORT_CODES,
  FlightParamsSchema,
  UpdateFlightStatusRequestSchema,
  toBogotaDate,
  type FlightDto,
  type SearchFlightsQuery,
  type UpdateFlightStatusRequest,
} from '@kata/shared';
import { ApiService } from '../../core/api.service';
import { FLIGHT_STATUS_LABEL, formatDate, formatTime } from '../../shared/format';
import { inputValue, validate } from '../../shared/forms';
import { IconComponent } from '../../shared/ui/icon.component';

const KEY_STORAGE = 'kata.adminKey';
type Action = 'DELAYED' | 'CANCELLED';

/** Las 20 rutas dirigidas disponibles; el panel permite escoger cualquiera para la fecha elegida. */
const OPERATIONS_ROUTES: ReadonlyArray<Pick<SearchFlightsQuery, 'origin' | 'destination'>> =
  AIRPORT_CODES.flatMap((origin) =>
    AIRPORT_CODES.filter((destination) => destination !== origin).map((destination) => ({
      origin,
      destination,
    })),
  );

const DEFAULT_OPERATIONS_DATE = (): string => toBogotaDate(new Date(Date.now() + 86_400_000));

function readKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function storeKey(key: string): void {
  try {
    sessionStorage.setItem(KEY_STORAGE, key);
  } catch {
    // Sin almacenamiento de sesión: la clave vive solo en esta pantalla.
  }
}

/** `datetime-local` en hora de Bogotá → ISO 8601 (Colombia es UTC-5 todo el año). */
const bogotaToIso = (local: string): string =>
  local === '' ? '' : new Date(`${local}:00-05:00`).toISOString();

/**
 * `/admin` (HU4): clave en `sessionStorage` (solo esta pestaña), vuelo, retraso con nueva hora o
 * cancelación. Muestra 401, 422 y 429 junto al formulario.
 */
@Component({
  selector: 'app-admin-page',
  imports: [IconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin.page.html',
  styles: `
    :host {
      display: block;
      max-width: 1100px;
      margin: 0 auto;
    }
    .operations-layout {
      display: grid;
      grid-template-columns: minmax(0, 45fr) minmax(0, 55fr);
      gap: var(--space-6);
      align-items: start;
    }
    .page-title {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-2);
    }
    .title-icon {
      display: grid;
      width: 2.5rem;
      height: 2.5rem;
      place-items: center;
      border-radius: var(--radius-md);
      color: var(--color-primary);
      background: var(--color-info-bg);
    }
    .restricted {
      display: inline-flex;
      gap: var(--space-1);
      align-items: center;
      padding: 0.2rem var(--space-2);
      border-radius: 999px;
      color: var(--color-danger-fg);
      background: var(--color-danger-bg);
      font-size: var(--font-size-sm);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .operations-card,
    .flights-panel {
      padding: var(--space-6);
      border: 1px solid rgb(15 23 42 / 0.08);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-1);
    }
    .panel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .panel-heading h3 { margin: 0; }
    .field-control {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      box-sizing: border-box;
      padding: 0 var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
    }
    .field-control:focus-within {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 4px rgb(11 87 208 / 0.18);
    }
    .field-control app-icon { color: var(--color-text-muted); }
    .field-control input {
      flex: 1;
      width: 100%;
      min-width: 0;
      padding-inline: 0;
      border: 0;
      outline: 0;
    }
    .icon-button {
      display: inline-grid;
      width: 2.25rem;
      height: 2.25rem;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      background: transparent;
      cursor: pointer;
    }
    .icon-button:hover { color: var(--color-primary); background: var(--color-info-bg); }
    fieldset { border: 0; padding: 0; margin: 0 0 var(--space-4); }
    legend { margin-bottom: var(--space-2); font-weight: 700; }
    .action-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .action-option {
      display: grid;
      gap: var(--space-1);
      min-height: 7rem;
      padding: var(--space-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text);
      background: var(--color-surface);
      text-align: left;
      cursor: pointer;
    }
    .action-option app-icon { align-self: start; }
    .action-option strong { font-size: var(--font-size-md); }
    .action-option span { color: var(--color-text-muted); font-size: var(--font-size-sm); }
    .action-delay[aria-pressed='true'] {
      border-color: #d97706;
      color: #92400e;
      background: var(--color-warning-bg);
      box-shadow: inset 0 0 0 1px #d97706;
    }
    .action-cancel[aria-pressed='true'] {
      border-color: var(--color-danger-fg);
      color: var(--color-danger-fg);
      background: var(--color-danger-bg);
      box-shadow: inset 0 0 0 1px var(--color-danger-fg);
    }
    .submit-action { width: 100%; }
    .submit-delay { border-color: #b45309; background: #b45309; }
    .submit-delay:hover:not(:disabled) { background: #92400e; }
    .dashboard-link { display: inline-block; margin-top: var(--space-2); font-weight: 700; }
    .flight-list { display: grid; gap: var(--space-2); }
    .flight-row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--space-3);
      align-items: center;
      width: 100%;
      padding: var(--space-3);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      color: inherit;
      background: var(--color-bg);
      text-align: left;
      cursor: pointer;
    }
    .flight-row:hover { border-color: var(--color-primary); background: var(--color-info-bg); }
    .flight-row.selected { border-color: var(--color-primary); background: var(--color-info-bg); box-shadow: inset 0 0 0 1px var(--color-primary); }
    .flight-code { font-family: ui-monospace, monospace; font-weight: 800; }
    .flight-route { display: block; font-weight: 700; }
    .flight-meta { display: block; color: var(--color-text-muted); font-size: var(--font-size-sm); }
    .status { justify-self: end; white-space: nowrap; }
    @media (max-width: 800px) {
      .operations-layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 420px) {
      .operations-card, .flights-panel { padding: var(--space-4); }
      .action-options { grid-template-columns: 1fr; }
      .flight-row { grid-template-columns: 1fr auto; }
      .flight-code { grid-column: 1 / -1; }
    }
  `,
})
export class AdminPage implements OnInit {
  readonly flight = input<string>();
  private readonly api = inject(ApiService);

  protected readonly adminKey = signal(readKey());
  protected readonly flightId = linkedSignal(() => this.flight() ?? '');
  protected readonly action = signal<Action>('DELAYED');
  protected readonly newDeparture = signal('');
  protected readonly showKey = signal(false);
  protected readonly current = signal<FlightDto | null>(null);
  protected readonly operationFlights = signal<FlightDto[]>([]);
  protected readonly operationDate = signal(DEFAULT_OPERATIONS_DATE());
  protected readonly loadingFlights = signal(false);
  protected readonly flightsError = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly value = inputValue;
  protected readonly statusLabel = FLIGHT_STATUS_LABEL;
  protected readonly time = formatTime;
  protected readonly date = formatDate;

  ngOnInit(): void {
    void this.loadFlight();
    void this.loadOperationFlights();
  }

  protected setKey(event: Event): void {
    this.adminKey.set(inputValue(event));
    storeKey(this.adminKey());
  }

  protected toggleKey(): void {
    this.showKey.update((visible) => !visible);
  }

  async loadFlight(): Promise<void> {
    this.current.set(null);
    if (!FlightParamsSchema.safeParse({ flightId: this.flightId() }).success) {
      return;
    }
    try {
      this.current.set(await this.api.getFlight(this.flightId(), { silent: true }));
    } catch {
      this.current.set(null);
    }
  }

  protected selectFlight(flight: FlightDto): void {
    this.flightId.set(flight.id);
    this.current.set(flight);
    this.error.set(null);
    this.success.set(null);
  }

  protected setOperationDate(event: Event): void {
    this.operationDate.set(this.value(event));
    void this.loadOperationFlights();
  }

  protected async loadOperationFlights(): Promise<void> {
    this.loadingFlights.set(true);
    this.flightsError.set(false);
    const date = this.operationDate();
    try {
      const groups = await Promise.all(
        OPERATIONS_ROUTES.map((route) => this.api.searchFlights({ ...route, date })),
      );
      if (date === this.operationDate()) {
        this.operationFlights.set(
          groups
            .flat()
            .sort((left, right) => left.departureAt.localeCompare(right.departureAt)),
        );
      }
    } catch {
      if (date === this.operationDate()) {
        this.flightsError.set(true);
      }
    } finally {
      if (date === this.operationDate()) {
        this.loadingFlights.set(false);
      }
    }
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.success.set(null);
    const body =
      this.action() === 'DELAYED'
        ? { status: 'DELAYED', newDepartureAt: bogotaToIso(this.newDeparture()) }
        : { status: 'CANCELLED' };
    const request = validate(UpdateFlightStatusRequestSchema, body);
    if (
      !FlightParamsSchema.safeParse({ flightId: this.flightId() }).success ||
      request.data === null
    ) {
      this.error.set('Revisa el vuelo y la nueva hora de salida.');
      return;
    }
    await this.send(request.data);
  }

  private async send(request: UpdateFlightStatusRequest): Promise<void> {
    this.busy.set(true);
    try {
      const flight = await this.api.updateFlightStatus(this.flightId(), request, this.adminKey());
      this.current.set(flight);
      this.operationFlights.update((flights) =>
        flights.map((item) => (item.id === flight.id ? flight : item)),
      );
      this.success.set(
        `Listo: el vuelo ${flight.flightNumber} quedó ${FLIGHT_STATUS_LABEL[flight.status].toLowerCase()}.`,
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos actualizar el vuelo.');
    } finally {
      this.busy.set(false);
    }
  }
}
