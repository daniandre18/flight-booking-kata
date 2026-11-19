import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { FlightChange, FlightDto, FlightStatsEvent, SearchFlightsQuery } from '@kata/shared';
import { ApiService } from '../../core/api.service';
import { RealtimeService } from '../../core/realtime.service';

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Ventana para agrupar los pedidos de resincronización (contracts/realtime-events.md, regla 6). */
export const RESYNC_BATCH_MS = 250;

const CHANGE_STATUSES = new Set(['DELAYED', 'CANCELLED', 'SOLD_OUT']);

function applyStats(flight: FlightDto, event: FlightStatsEvent): FlightDto {
  return {
    ...flight,
    seq: event.seq,
    status: event.status,
    departureAt: event.departureAt,
    arrivalAt: event.arrivalAt,
    delayed: event.delayed,
    availableSeats: event.availableSeats,
  };
}

/**
 * Resultados de búsqueda en vivo (HU1). Room `search`: por vuelo listado aplica `flight:stats` si
 * `seq === última + 1`, descarta `seq <= última` y, ante un salto, pide el vuelo por HTTP
 * agrupando en 250 ms. Al reconectar vuelve a buscar.
 */
@Injectable()
export class SearchResultsStore {
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly pendingResync = new Set<string>();
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private lastQuery: SearchFlightsQuery | null = null;
  private subscribed = false;

  readonly flights = signal<FlightDto[]>([]);
  readonly status = signal<SearchStatus>('idle');
  /** Último cambio anunciado por vuelo (RUX-023). */
  readonly notices = signal<Record<string, FlightChange>>({});

  constructor() {
    this.realtime
      .on('flight:stats')
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.onStats(event));
    this.realtime.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => void this.refresh());
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  async search(query: SearchFlightsQuery): Promise<void> {
    this.lastQuery = query;
    this.notices.set({});
    this.status.set('loading');
    await this.ensureSubscribed();
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const query = this.lastQuery;
    if (query === null) {
      return;
    }
    try {
      const flights = await this.api.searchFlights(query);
      if (query === this.lastQuery) {
        this.flights.set(flights);
        this.status.set('ready');
      }
    } catch {
      this.status.set('error');
    }
  }

  private async ensureSubscribed(): Promise<void> {
    if (!this.subscribed) {
      this.subscribed = true;
      await this.realtime.subscribeSearch();
    }
  }

  private onStats(event: FlightStatsEvent): void {
    const current = this.flights().find((flight) => flight.id === event.flightId);
    if (current === undefined || event.seq <= current.seq) {
      return;
    }
    if (event.seq !== current.seq + 1) {
      this.scheduleResync(event.flightId);
      return;
    }
    this.replace(applyStats(current, event));
    if (event.change !== undefined) {
      this.notices.update((notices) => ({
        ...notices,
        [event.flightId]: event.change as FlightChange,
      }));
    }
  }

  private replace(updated: FlightDto): void {
    this.flights.update((flights) =>
      flights.map((flight) => (flight.id === updated.id ? updated : flight)),
    );
  }

  private scheduleResync(flightId: string): void {
    this.pendingResync.add(flightId);
    this.resyncTimer ??= setTimeout(() => void this.flushResync(), RESYNC_BATCH_MS);
  }

  private async flushResync(): Promise<void> {
    const ids = [...this.pendingResync];
    this.pendingResync.clear();
    this.resyncTimer = null;
    await Promise.all(ids.map((id) => this.resyncFlight(id)));
  }

  private async resyncFlight(flightId: string): Promise<void> {
    try {
      const fresh = await this.api.getFlight(flightId, { silent: true });
      const current = this.flights().find((flight) => flight.id === flightId);
      if (current === undefined || fresh.seq < current.seq) {
        return;
      }
      if (fresh.status !== current.status && CHANGE_STATUSES.has(fresh.status)) {
        this.notices.update((notices) => ({
          ...notices,
          [flightId]: fresh.status as FlightChange,
        }));
      }
      this.replace(fresh);
    } catch {
      // Se reintenta con el siguiente salto o al reconectar.
    }
  }

  private dispose(): void {
    if (this.resyncTimer !== null) {
      clearTimeout(this.resyncTimer);
    }
    if (this.subscribed) {
      this.realtime.unsubscribeSearch();
    }
  }
}
