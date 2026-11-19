import { computed, inject, Injectable, signal } from '@angular/core';
import type { ActivityEntryDto, FlightEventType, FlightRoomEvent } from '@kata/shared';
import { ApiService } from '../../core/api.service';
import { FlightRoomSync } from '../../core/flight-state/flight-room-sync';
import { seatCounts } from '../../core/flight-state/flight-state.reducer';

export const ACTIVITY_LIMIT = 50;

const EVENT_TYPE: Record<FlightRoomEvent['type'], FlightEventType> = {
  'seat:held': 'SEAT_HELD',
  'seat:released': 'SEAT_RELEASED',
  'seat:booked': 'SEAT_BOOKED',
  'flight:updated': 'FLIGHT_UPDATED',
};

function toEntry(event: FlightRoomEvent): ActivityEntryDto {
  const base = {
    seq: event.data.seq,
    type: EVENT_TYPE[event.type],
    status: event.data.status,
    occurredAt: event.data.occurredAt,
  };
  switch (event.type) {
    case 'flight:updated':
      return { ...base, seatId: null };
    case 'seat:released':
      return { ...base, seatId: event.data.seatId, reason: event.data.reason };
    default:
      return { ...base, seatId: event.data.seatId };
  }
}

/**
 * Tablero en vivo (HU4): snapshot `GET /flights/:id/seats` + `GET /flights/:id/events`, misma
 * sincronización por `seq` que el mapa (reductor compartido). Contadores derivados del estado
 * (siempre suman el total, CE-005); cada evento aplicado se antepone al registro.
 */
@Injectable()
export class DashboardStore {
  private readonly sync = inject(FlightRoomSync);
  private readonly api = inject(ApiService);
  private loadedLog: ActivityEntryDto[] = [];
  private flightId = '';

  readonly activity = signal<ActivityEntryDto[]>([]);
  readonly flight = computed(() => this.sync.state().flight);
  readonly syncing = this.sync.syncing;
  readonly failed = this.sync.failed;
  readonly counts = computed(() => seatCounts(this.sync.state()));
  readonly occupancyPercent = computed(() => {
    const { booked, total } = this.counts();
    return total === 0 ? 0 : Math.round((booked / total) * 1000) / 10;
  });

  async init(flightId: string): Promise<void> {
    this.flightId = flightId;
    await this.sync.start(flightId, {
      load: async () => {
        this.loadedLog = await this.api.getFlightEvents(this.flightId, ACTIVITY_LIMIT);
      },
      // Solo hasta la seq del snapshot: lo posterior llega como evento (sin duplicados).
      onSnapshot: (snapshot) =>
        this.activity.set(this.loadedLog.filter((item) => item.seq <= snapshot.seq)),
      onApplied: (event) =>
        this.activity.update((log) => [toEntry(event), ...log].slice(0, ACTIVITY_LIMIT)),
    });
  }
}
