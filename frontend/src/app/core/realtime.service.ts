import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import {
  REALTIME_NAMESPACE,
  type ClientToServerEvents,
  type FlightJoinAck,
  type RoomAck,
  type ServerToClientEvents,
} from '@kata/shared';
import { Observable, Subject } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { ClientIdService } from './client-id.service';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionState = 'connected' | 'reconnecting';
export type ServerEvent = keyof ServerToClientEvents;
export type PayloadOf<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>[0];

const ACK_TIMEOUT_MS = 5_000;
const SEARCH_ROOM_KEY = 'search';

/** Fábrica del socket (inyectable para probar con un socket simulado). */
export const SOCKET_FACTORY = new InjectionToken<(clientId: string) => RealtimeSocket>(
  'SocketFactory',
  {
    providedIn: 'root',
    factory: () => (clientId: string) =>
      io(REALTIME_NAMESPACE, { auth: { clientId }, transports: ['websocket', 'polling'] }),
  },
);

/**
 * Socket tipado al namespace `/realtime` (contracts/realtime-events.md). Solo escucha y se une a
 * rooms: los comandos van por HTTP (principio II). Lleva la cuenta de rooms y se vuelve a unir al
 * reconectar; `reconnected$` avisa para que cada store pida su snapshot.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly clientIds = inject(ClientIdService);
  private readonly createSocket = inject(SOCKET_FACTORY);
  private readonly rooms = new Map<string, number>();
  private readonly reconnectedSubject = new Subject<void>();
  private readonly state = signal<ConnectionState>('reconnecting');
  private socket: RealtimeSocket | null = null;
  private hasConnected = false;

  readonly connection = this.state.asReadonly();
  readonly reconnected$ = this.reconnectedSubject.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.socket?.disconnect());
  }

  /** Un Observable por evento del servidor. */
  on<E extends ServerEvent>(event: E): Observable<PayloadOf<E>> {
    const socket = this.ensureSocket();
    return new Observable<PayloadOf<E>>((subscriber) => {
      const listener = (payload: PayloadOf<E>) => subscriber.next(payload);
      socket.on(event, listener as never);
      return () => socket.off(event, listener as never);
    });
  }

  joinFlight(flightId: string): Promise<FlightJoinAck> {
    this.retain(flightId);
    return this.emitJoin(flightId);
  }

  async leaveFlight(flightId: string): Promise<void> {
    if (this.release(flightId)) {
      await this.ensureSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('flight:leave', { flightId });
    }
  }

  subscribeSearch(): Promise<RoomAck> {
    this.retain(SEARCH_ROOM_KEY);
    return this.emitSearch();
  }

  /** No hay `search:unsubscribe` en el contrato: deja de re-unirse y los eventos se filtran. */
  unsubscribeSearch(): void {
    this.release(SEARCH_ROOM_KEY);
  }

  private ensureSocket(): RealtimeSocket {
    if (this.socket !== null) {
      return this.socket;
    }
    const socket = this.createSocket(this.clientIds.clientId);
    socket.on('connect', () => this.onConnect());
    socket.on('disconnect', () => this.state.set('reconnecting'));
    socket.on('connect_error', () => this.state.set('reconnecting'));
    this.socket = socket;
    return socket;
  }

  private onConnect(): void {
    this.state.set('connected');
    if (!this.hasConnected) {
      this.hasConnected = true;
      return;
    }
    for (const room of this.rooms.keys()) {
      void (room === SEARCH_ROOM_KEY ? this.emitSearch() : this.emitJoin(room));
    }
    this.reconnectedSubject.next();
  }

  private emitJoin(flightId: string): Promise<FlightJoinAck> {
    return this.ensureSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('flight:join', { flightId });
  }

  private emitSearch(): Promise<RoomAck> {
    return this.ensureSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('search:subscribe', {});
  }

  private retain(room: string): void {
    this.rooms.set(room, (this.rooms.get(room) ?? 0) + 1);
  }

  /** `true` si era el último usuario del room. */
  private release(room: string): boolean {
    const count = (this.rooms.get(room) ?? 0) - 1;
    if (count > 0) {
      this.rooms.set(room, count);
      return false;
    }
    this.rooms.delete(room);
    return count === 0;
  }
}
