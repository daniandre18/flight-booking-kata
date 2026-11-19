import {
  REALTIME_NAMESPACE,
  type ClientToServerEvents,
  type FlightJoinAck,
  type ServerToClientEvents,
} from '@kata/shared';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ServerToClientEvents;
type PayloadOf<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

const open: TestSocket[] = [];

/** Conecta al namespace `/realtime` con un `clientId` (v4 por defecto). */
export function connectSocket(
  baseUrl: string,
  clientId: string | null = randomUUID(),
): Promise<TestSocket> {
  const socket: TestSocket = io(`${baseUrl}${REALTIME_NAMESPACE}`, {
    auth: clientId === null ? {} : { clientId },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  open.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

export function closeSockets(): void {
  open.splice(0).forEach((socket) => socket.close());
}

export function joinFlight(socket: TestSocket, flightId: string): Promise<FlightJoinAck> {
  return socket.timeout(2_000).emitWithAck('flight:join', { flightId });
}

/** Guarda en orden todo lo que recibe el socket para un evento. */
export function collect<E extends EventName>(socket: TestSocket, event: E): PayloadOf<E>[] {
  const received: PayloadOf<E>[] = [];
  socket.on(event, ((payload: PayloadOf<E>) => received.push(payload)) as never);
  return received;
}

/** Espera el primer evento que cumpla `predicate`; falla si no llega a tiempo. */
export function waitForEvent<E extends EventName>(
  socket: TestSocket,
  event: E,
  predicate: (payload: PayloadOf<E>) => boolean = () => true,
  timeoutMs = 3_000,
): Promise<PayloadOf<E>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener as never);
      reject(new Error(`No llegó ${event} en ${timeoutMs} ms`));
    }, timeoutMs);
    const listener = (payload: PayloadOf<E>) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, listener as never);
        resolve(payload);
      }
    };
    socket.on(event, listener as never);
  });
}

/** Deja pasar un momento para comprobar que algo NO llega. */
export function settle(milliseconds = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
