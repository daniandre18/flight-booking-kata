import {
  ChangeDetectionStrategy,
  Component,
  computed,
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

/** Todas las rutas dirigidas disponibles; el panel permite escoger cualquiera para la fecha elegida. */
const OPERATIONS_ROUTES: ReadonlyArray<Pick<SearchFlightsQuery, 'origin' | 'destination'>> =
  AIRPORT_CODES.flatMap((origin) =>
    AIRPORT_CODES.filter((destination) => destination !== origin).map((destination) => ({
      origin,
      destination,
    })),
  );

const DEFAULT_OPERATIONS_DATE = (): string => toBogotaDate(new Date(Date.now() + 86_400_000));
const FLIGHTS_PER_PAGE = 12;

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
  styleUrl: './admin.page.scss',
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
  protected readonly operationPage = signal(1);
  protected readonly loadingFlights = signal(false);
  protected readonly flightsError = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly value = inputValue;
  protected readonly statusLabel = FLIGHT_STATUS_LABEL;
  protected readonly time = formatTime;
  protected readonly date = formatDate;
  protected readonly pageSize = FLIGHTS_PER_PAGE;
  protected readonly operationPageCount = computed(() =>
    Math.max(1, Math.ceil(this.operationFlights().length / this.pageSize)),
  );
  protected readonly pagedOperationFlights = computed(() => {
    const start = (this.operationPage() - 1) * this.pageSize;
    return this.operationFlights().slice(start, start + this.pageSize);
  });

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
    this.operationPage.set(1);
    void this.loadOperationFlights();
  }

  protected previousOperationPage(): void {
    this.operationPage.update((page) => Math.max(1, page - 1));
  }

  protected nextOperationPage(): void {
    this.operationPage.update((page) => Math.min(this.operationPageCount(), page + 1));
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
        this.operationPage.set(1);
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
