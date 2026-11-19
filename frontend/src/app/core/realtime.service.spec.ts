import { TestBed } from '@angular/core/testing';
import { firstValueFrom, take, toArray } from 'rxjs';
import { ClientIdService } from './client-id.service';
import { RealtimeService, SOCKET_FACTORY, type RealtimeSocket } from './realtime.service';

type Handler = (...args: unknown[]) => void;

/** Socket simulado: registra emisiones y permite disparar eventos del servidor. */
class FakeSocket {
  readonly handlers = new Map<string, Handler[]>();
  readonly emitted: { event: string; payload: unknown }[] = [];
  connected = false;

  on(event: string, handler: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  off(event: string, handler: Handler): this {
    this.handlers.set(
      event,
      (this.handlers.get(event) ?? []).filter((h) => h !== handler),
    );
    return this;
  }

  timeout(): this {
    return this;
  }

  emitWithAck(event: string, payload: unknown): Promise<unknown> {
    this.emitted.push({ event, payload });
    return Promise.resolve(event === 'flight:join' ? { ok: true, seq: 5 } : { ok: true });
  }

  fire(event: string, ...args: unknown[]): void {
    (this.handlers.get(event) ?? []).forEach((handler) => handler(...args));
  }

  connect(): this {
    this.connected = true;
    this.fire('connect');
    return this;
  }

  disconnect(): this {
    this.connected = false;
    return this;
  }
}

describe('RealtimeService', () => {
  let socket: FakeSocket;
  let service: RealtimeService;
  let factoryCalls: string[];

  beforeEach(() => {
    socket = new FakeSocket();
    factoryCalls = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ClientIdService,
          useValue: { clientId: '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192' },
        },
        {
          provide: SOCKET_FACTORY,
          useValue: (clientId: string) => {
            factoryCalls.push(clientId);
            return socket as unknown as RealtimeSocket;
          },
        },
      ],
    });
    service = TestBed.inject(RealtimeService);
  });

  it('se conecta con el clientId en el handshake y expone el estado de conexión', () => {
    expect(service.connection()).toBe('reconnecting');
    service.on('seat:held').subscribe();
    expect(factoryCalls).toEqual(['3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192']);
    socket.fire('connect');
    expect(service.connection()).toBe('connected');
    socket.fire('disconnect');
    expect(service.connection()).toBe('reconnecting');
  });

  it('flight:join devuelve el ack con seq y registra el room', async () => {
    await expect(service.joinFlight('f1')).resolves.toEqual({ ok: true, seq: 5 });
    expect(socket.emitted).toEqual([{ event: 'flight:join', payload: { flightId: 'f1' } }]);
  });

  it('al reconectar vuelve a unirse a los rooms registrados y avisa', async () => {
    await service.joinFlight('f1');
    await service.subscribeSearch();
    socket.fire('connect');
    const reconnected = firstValueFrom(service.reconnected$);
    socket.fire('disconnect');
    socket.fire('connect');
    await reconnected;
    await Promise.resolve();
    expect(socket.emitted.map((entry) => entry.event)).toEqual([
      'flight:join',
      'search:subscribe',
      'flight:join',
      'search:subscribe',
    ]);
  });

  it('un room liberado ya no se vuelve a unir al reconectar', async () => {
    await service.joinFlight('f1');
    await service.leaveFlight('f1');
    socket.fire('connect');
    socket.fire('disconnect');
    socket.fire('connect');
    await Promise.resolve();
    expect(socket.emitted.map((entry) => entry.event)).toEqual(['flight:join', 'flight:leave']);
  });

  it('dos usuarios del mismo room (mapa y tablero) solo salen cuando ambos se van', async () => {
    await service.joinFlight('f1');
    await service.joinFlight('f1');
    await service.leaveFlight('f1');
    expect(socket.emitted.filter((entry) => entry.event === 'flight:leave')).toEqual([]);
    await service.leaveFlight('f1');
    expect(socket.emitted.filter((entry) => entry.event === 'flight:leave')).toHaveLength(1);
  });

  it('expone un Observable por evento', async () => {
    const received = firstValueFrom(service.on('seat:released').pipe(take(2), toArray()));
    socket.fire('seat:released', { seq: 1 });
    socket.fire('seat:held', { seq: 2 });
    socket.fire('seat:released', { seq: 3 });
    await expect(received).resolves.toEqual([{ seq: 1 }, { seq: 3 }]);
  });
});
