import { applyDecorators, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  REALTIME_NAMESPACE,
  RealtimeEvents,
  SEARCH_ROOM,
  flightRoom,
  type ClientToServerEvents,
  type FlightJoinAck,
  type RoomAck,
  type ServerToClientEvents,
} from '@kata/shared';
import type { Namespace, Socket } from 'socket.io';
import { FLIGHT_QUERY_PORT, type FlightQueryPort } from '../../flights';
import { domainEventName, type DomainEvent } from '../../shared-kernel/application/event-publisher';
import { CLOCK, type Clock } from '../../shared-kernel/domain/clock';
import { toRealtimeMessage } from '../application/to-realtime-event';
import { clientIdHandshake, parseRoomPayload } from './socket-handshake';

type RealtimeNamespace = Namespace<ClientToServerEvents, ServerToClientEvents>;

/** Todos los eventos de dominio que se difunden (se publican solo tras el commit). */
export const DOMAIN_EVENTS = (
  ['SeatHeld', 'SeatReleased', 'SeatBooked', 'FlightUpdated', 'FlightStatsChanged'] as const
).map(domainEventName);

/**
 * Un `@OnEvent` por nombre. `@OnEvent([...])` NO escucha varios eventos: EventEmitter2 trata el
 * arreglo como un único nombre (o como una ruta con comodines), así que nunca se dispararía.
 */
const OnDomainEvents = (): MethodDecorator =>
  applyDecorators(...DOMAIN_EVENTS.map((name) => OnEvent(name)));

/**
 * Traduce Socket.io ↔ aplicación sin lógica de negocio (principio II, contracts/realtime-events.md).
 * El cliente solo puede unirse o salir de rooms; cualquier otro evento se ignora y no se reenvía.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server: RealtimeNamespace;

  constructor(
    @Inject(FLIGHT_QUERY_PORT) private readonly flights: FlightQueryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  afterInit(server: RealtimeNamespace): void {
    server.use(clientIdHandshake);
  }

  /** Une al room del vuelo y devuelve su `seq` actual. */
  @SubscribeMessage(RealtimeEvents.FlightJoin)
  async joinFlight(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<FlightJoinAck> {
    const parsed = parseRoomPayload(payload);
    if (!parsed.ok) {
      return parsed;
    }
    const flight = await this.flights.getById(parsed.flightId, this.clock.now());
    if (flight === null) {
      return { ok: false, code: 'FLIGHT_NOT_FOUND' };
    }
    await socket.join(flightRoom(parsed.flightId));
    return { ok: true, seq: flight.seq };
  }

  @SubscribeMessage(RealtimeEvents.FlightLeave)
  async leaveFlight(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<RoomAck> {
    const parsed = parseRoomPayload(payload);
    if (!parsed.ok) {
      return parsed;
    }
    await socket.leave(flightRoom(parsed.flightId));
    return { ok: true };
  }

  @SubscribeMessage(RealtimeEvents.SearchSubscribe)
  async subscribeSearch(@ConnectedSocket() socket: Socket): Promise<RoomAck> {
    await socket.join(SEARCH_ROOM);
    return { ok: true };
  }

  /** Difunde cada evento de dominio a su room. Un fallo no debe afectar a la operación ya hecha. */
  @OnDomainEvents()
  broadcast(event: DomainEvent): void {
    try {
      const message = toRealtimeMessage(event);
      this.server.to(message.room).emit(message.event, message.payload as never);
    } catch (error) {
      this.logger.error({ err: error, type: event.type }, 'No se pudo difundir el evento');
    }
  }
}
