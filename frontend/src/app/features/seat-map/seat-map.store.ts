import { computed, inject, Injectable, signal } from '@angular/core';
import type { FlightRoomEvent } from '@kata/shared';
import { ApiService } from '../../core/api.service';
import { FlightRoomSync } from '../../core/flight-state/flight-room-sync';
import {
  isFlightClosed,
  isMine,
  type SeatState,
} from '../../core/flight-state/flight-state.reducer';
import { NotificationService } from '../../core/notification.service';
import { RealtimeService } from '../../core/realtime.service';
import type { SeatCell, SeatDisplay } from './seat-cell';
import type { SummarySeat } from './seat-summary-panel.component';

type Pending = 'holding' | 'releasing';

const HIGHLIGHT_MS = 600;
const CLOSED_REASON = {
  CANCELLED: 'Este vuelo fue cancelado. Ya no se pueden elegir asientos.',
  SOLD_OUT: 'Este vuelo está agotado. Ya no quedan asientos.',
} as const;

/**
 * Estado del mapa (HU2): sincronización por `seq` con resincronización (RUX-019, RUX-020), bloqueo
 * optimista que se revierte ante 409, 422 o 429 (principio VI), liberación, recuperación de los
 * bloqueos propios al recargar y vencimiento local que vacía el resumen (RUX-014).
 */
@Injectable()
export class SeatMapStore {
  private readonly sync = inject(FlightRoomSync);
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly notifications = inject(NotificationService);
  private readonly pending = signal<ReadonlyMap<string, Pending>>(new Map());
  private readonly expiredLocally = signal(false);
  private flightId = '';

  readonly holderTag = signal<string | null>(null);
  /** serverNow − Date.now(): corrige la cuenta regresiva. */
  readonly offsetMs = signal(0);
  readonly highlighted = signal<ReadonlySet<string>>(new Set());
  /** Texto para la región `aria-live` del mapa. */
  readonly announcement = signal('');

  readonly flight = computed(() => this.sync.state().flight);
  readonly failed = this.sync.failed;
  readonly busy = computed(() => this.sync.syncing() || this.realtime.connection() !== 'connected');
  readonly closedReason = computed(() => {
    const status = this.flight()?.status;
    return status === 'CANCELLED' || status === 'SOLD_OUT' ? CLOSED_REASON[status] : null;
  });
  readonly cells = computed<SeatCell[]>(() =>
    this.sync.state().seats.map((seat) => ({
      seatId: seat.seatId,
      row: seat.row,
      letter: seat.letter,
      type: seat.type,
      price: seat.price,
      display: this.displayOf(seat),
    })),
  );
  readonly mySeats = computed<SummarySeat[]>(() =>
    this.expiredLocally()
      ? []
      : this.sync
          .state()
          .seats.filter((seat) => isMine(seat, this.holderTag()))
          .map(({ seatId, type, price }) => ({ seatId, type, price })),
  );
  readonly expiresAt = computed(() => {
    const mine = this.sync.state().seats.filter((seat) => isMine(seat, this.holderTag()));
    return mine.map((seat) => seat.holdExpiresAt ?? '').sort()[0] ?? null;
  });

  async init(flightId: string): Promise<void> {
    this.flightId = flightId;
    await this.sync.start(flightId, {
      load: () => this.loadMyHolds(),
      onApplied: (event) => this.onRemoteChange(event),
    });
  }

  async toggle(seatId: string): Promise<void> {
    const seat = this.seat(seatId);
    if (
      seat === undefined ||
      this.busy() ||
      isFlightClosed(this.flight()) ||
      this.pending().has(seatId)
    ) {
      return;
    }
    await (this.displayOf(seat) === 'mine' ? this.release(seatId) : this.hold(seatId));
  }

  async release(seatId: string): Promise<void> {
    this.setPending(seatId, 'releasing');
    try {
      await this.api.releaseSeat(this.flightId, seatId);
      this.sync.dispatch({ type: 'releaseConfirmed', seatId, holderTag: this.holderTag() ?? '' });
      this.announcement.set(`Liberaste el asiento ${seatId}.`);
    } catch {
      // El interceptor ya mostró el mensaje; el mapa vuelve al último estado confirmado.
    } finally {
      this.setPending(seatId, null);
    }
  }

  /** La cuenta regresiva llegó a 0: el resumen se vacía ya; el barrido lo confirma en ~2 s. */
  onExpired(): void {
    this.expiredLocally.set(true);
    this.announcement.set('Tu tiempo terminó y los asientos se liberaron.');
  }

  private async hold(seatId: string): Promise<void> {
    this.setPending(seatId, 'holding');
    try {
      const response = await this.api.holdSeat(this.flightId, seatId);
      this.holderTag.set(response.holderTag);
      this.offsetMs.set(new Date(response.serverNow).getTime() - Date.now());
      this.expiredLocally.set(false);
      this.sync.dispatch({
        type: 'holdConfirmed',
        seatId,
        holderTag: response.holderTag,
        holdExpiresAt: response.holdExpiresAt,
      });
      this.announcement.set(`Bloqueaste el asiento ${seatId}.`);
    } catch {
      // Revert: se quita el estado provisional (409, 422 HOLD_LIMIT_REACHED, 429…).
    } finally {
      this.setPending(seatId, null);
    }
  }

  private async loadMyHolds(): Promise<void> {
    const holds = await this.api.getMyHolds(this.flightId);
    this.holderTag.set(holds.holderTag);
    this.offsetMs.set(new Date(holds.serverNow).getTime() - Date.now());
    this.expiredLocally.set(false);
  }

  private displayOf(seat: SeatState): SeatDisplay {
    const pending = this.pending().get(seat.seatId);
    if (pending !== undefined) {
      return pending === 'holding' ? 'mine' : 'available';
    }
    if (seat.status === 'BOOKED') {
      return 'booked';
    }
    if (isFlightClosed(this.flight())) {
      return 'unavailable';
    }
    return seat.status === 'HELD' ? this.heldDisplay(seat) : 'available';
  }

  private heldDisplay(seat: SeatState): SeatDisplay {
    if (isMine(seat, this.holderTag())) {
      return this.expiredLocally() ? 'available' : 'mine';
    }
    const expiresAt = seat.holdExpiresAt === null ? 0 : new Date(seat.holdExpiresAt).getTime();
    return expiresAt > Date.now() + this.offsetMs() ? 'other' : 'available';
  }

  private onRemoteChange(event: FlightRoomEvent): void {
    if (event.type === 'flight:updated') {
      this.onFlightUpdated(event);
      return;
    }
    const mineNow = event.type === 'seat:held' && event.data.holderTag === this.holderTag();
    if (!mineNow) {
      this.flash(event.data.seatId);
    }
  }

  private onFlightUpdated(event: Extract<FlightRoomEvent, { type: 'flight:updated' }>): void {
    if (event.data.status === 'CANCELLED' && this.mySeats().length > 0) {
      this.notifications.show(
        'El vuelo fue cancelado y tus asientos se liberaron. Busca otro vuelo.',
      );
    }
    if (event.data.change === 'DELAYED') {
      this.announcement.set('El vuelo se retrasó. Revisa la nueva hora de salida.');
    }
  }

  private flash(seatId: string): void {
    this.highlighted.update((set) => new Set([...set, seatId]));
    setTimeout(() => {
      this.highlighted.update((set) => new Set([...set].filter((id) => id !== seatId)));
    }, HIGHLIGHT_MS);
  }

  private seat(seatId: string): SeatState | undefined {
    return this.sync.state().seats.find((seat) => seat.seatId === seatId);
  }

  private setPending(seatId: string, value: Pending | null): void {
    this.pending.update((current) => {
      const next = new Map(current);
      if (value === null) {
        next.delete(seatId);
      } else {
        next.set(seatId, value);
      }
      return next;
    });
  }
}
