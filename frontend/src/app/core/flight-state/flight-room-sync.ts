import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { FlightRoomEvent, SeatMapSnapshot } from '@kata/shared';
import { filter, map, merge, type Observable } from 'rxjs';
import { ApiService } from '../api.service';
import { RealtimeService } from '../realtime.service';
import {
  flightStateReducer,
  initialFlightState,
  type FlightAction,
  type FlightState,
} from './flight-state.reducer';

export interface FlightRoomHooks {
  /** Carga extra en paralelo con el snapshot (bloqueos propios, registro de actividad). */
  load?: () => Promise<void>;
  /** Tras aplicar el snapshot y antes de los eventos que llegaron mientras tanto. */
  onSnapshot?: (snapshot: SeatMapSnapshot) => void;
  /** Cada evento aplicado en orden (resaltados, registro de actividad, avisos). */
  onApplied?: (event: FlightRoomEvent) => void;
}

/**
 * Sincronización del room `flight:{id}` (contracts/realtime-events.md, reglas 1–5), compartida por
 * el mapa y el tablero (DRY): `flight:join` → snapshot → eventos guardados con `seq` mayor. Ante un
 * hueco o una reconexión vuelve a pedir el snapshot; mientras tanto `syncing` deshabilita acciones.
 */
@Injectable()
export class FlightRoomSync {
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stateSignal = signal<FlightState>(initialFlightState);
  private readonly syncingSignal = signal(true);
  private readonly failedSignal = signal(false);
  private buffer: FlightRoomEvent[] | null = null;
  private flightId: string | null = null;
  private hooks: FlightRoomHooks = {};

  readonly state = this.stateSignal.asReadonly();
  readonly syncing = this.syncingSignal.asReadonly();
  /** No se pudo cargar el vuelo (no existe o la api no responde). */
  readonly failed = this.failedSignal.asReadonly();

  async start(flightId: string, hooks: FlightRoomHooks = {}): Promise<void> {
    this.flightId = flightId;
    this.hooks = hooks;
    this.roomEvents(flightId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.receive(event));
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.resync());
    this.destroyRef.onDestroy(() => void this.realtime.leaveFlight(flightId));
    this.buffer = [];
    await this.realtime.joinFlight(flightId).catch(() => null);
    await this.resync();
  }

  dispatch(action: FlightAction): void {
    this.stateSignal.update((state) => flightStateReducer(state, action));
  }

  /** Pide el snapshot y aplica los eventos guardados mientras llegaba. */
  async resync(): Promise<void> {
    const flightId = this.flightId;
    if (flightId === null) {
      return;
    }
    this.syncingSignal.set(true);
    this.buffer ??= [];
    try {
      const [snapshot] = await Promise.all([this.api.getSeatMap(flightId), this.hooks.load?.()]);
      this.dispatch({ type: 'snapshot', snapshot });
      this.hooks.onSnapshot?.(snapshot);
      this.failedSignal.set(false);
      this.flushBuffer();
    } catch {
      this.buffer = null;
      this.failedSignal.set(true);
    } finally {
      this.syncingSignal.set(false);
    }
  }

  private flushBuffer(): void {
    const pending = (this.buffer ?? []).sort((a, b) => a.data.seq - b.data.seq);
    this.buffer = null;
    pending.forEach((event) => this.apply(event));
  }

  private receive(event: FlightRoomEvent): void {
    if (this.buffer !== null) {
      this.buffer.push(event);
      return;
    }
    this.apply(event);
  }

  private apply(event: FlightRoomEvent): void {
    const before = this.stateSignal();
    const after = flightStateReducer(before, { type: 'event', event });
    this.stateSignal.set(after);
    if (after.seq === event.data.seq && before.seq !== after.seq) {
      this.hooks.onApplied?.(event);
    }
    if (after.needsResync && !before.needsResync) {
      void this.resync();
    }
  }

  private roomEvents(flightId: string): Observable<FlightRoomEvent> {
    const of = <T extends FlightRoomEvent['type']>(type: T) =>
      this.realtime.on(type).pipe(map((data) => ({ type, data }) as FlightRoomEvent));
    // Un socket puede estar en varios rooms (mapa y tablero en la misma pestaña).
    return merge(
      of('seat:held'),
      of('seat:released'),
      of('seat:booked'),
      of('flight:updated'),
    ).pipe(filter((event) => event.data.flightId === flightId));
  }
}
