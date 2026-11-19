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
  FlightParamsSchema,
  UpdateFlightStatusRequestSchema,
  type FlightDto,
  type UpdateFlightStatusRequest,
} from '@kata/shared';
import { ApiService } from '../../core/api.service';
import { FLIGHT_STATUS_LABEL, formatDate, formatTime } from '../../shared/format';
import { inputValue, validate } from '../../shared/forms';

const KEY_STORAGE = 'kata.adminKey';
type Action = 'DELAYED' | 'CANCELLED';

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
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin.page.html',
  styles: `
    :host {
      display: block;
      max-width: 560px;
    }
    .actions {
      display: flex;
      gap: var(--space-4);
      margin-bottom: var(--space-3);
    }
    .actions label {
      display: inline-flex;
      gap: var(--space-2);
      align-items: center;
    }
    fieldset {
      border: none;
      padding: 0;
      margin: 0 0 var(--space-3);
    }
    legend {
      font-weight: 600;
      margin-bottom: var(--space-2);
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
  protected readonly current = signal<FlightDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly value = inputValue;
  protected readonly statusLabel = FLIGHT_STATUS_LABEL;
  protected readonly time = formatTime;
  protected readonly date = formatDate;

  ngOnInit(): void {
    void this.loadFlight();
  }

  protected setKey(event: Event): void {
    this.adminKey.set(inputValue(event));
    storeKey(this.adminKey());
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
