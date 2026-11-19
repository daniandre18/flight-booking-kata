import {
  FlightStatsEventSchema,
  FlightUpdatedEventSchema,
  SEARCH_ROOM,
  SeatBookedEventSchema,
  SeatHeldEventSchema,
  SeatReleasedEventSchema,
  flightRoom,
  type ServerToClientEvents,
} from '@kata/shared';
import type {
  DomainEvent,
  FlightStatsChanged,
  FlightUpdated,
  SeatBooked,
  SeatHeld,
  SeatReleased,
} from '../../shared-kernel/application/event-publisher';

type EventName = keyof ServerToClientEvents;

/** Mensaje listo para Socket.io: room destino, nombre del evento y payload del contrato. */
export type RealtimeMessage = {
  [E in EventName]: { room: string; event: E; payload: Parameters<ServerToClientEvents[E]>[0] };
}[EventName];

const base = (event: DomainEvent) => ({
  flightId: event.flightId,
  seq: event.seq,
  occurredAt: event.occurredAt.toISOString(),
});

const MAPPERS: {
  [T in DomainEvent['type']]: (event: Extract<DomainEvent, { type: T }>) => RealtimeMessage;
} = {
  SeatHeld: (event: SeatHeld) => ({
    room: flightRoom(event.flightId),
    event: 'seat:held',
    payload: SeatHeldEventSchema.parse({
      ...base(event),
      seatId: event.seatCode,
      status: 'HELD',
      holdExpiresAt: event.holdExpiresAt.toISOString(),
      holderTag: event.holderTag,
    }),
  }),
  SeatReleased: (event: SeatReleased) => ({
    room: flightRoom(event.flightId),
    event: 'seat:released',
    payload: SeatReleasedEventSchema.parse({
      ...base(event),
      seatId: event.seatCode,
      status: 'AVAILABLE',
      reason: event.reason,
    }),
  }),
  SeatBooked: (event: SeatBooked) => ({
    room: flightRoom(event.flightId),
    event: 'seat:booked',
    payload: SeatBookedEventSchema.parse({
      ...base(event),
      seatId: event.seatCode,
      status: 'BOOKED',
    }),
  }),
  FlightUpdated: (event: FlightUpdated) => ({
    room: flightRoom(event.flightId),
    event: 'flight:updated',
    payload: FlightUpdatedEventSchema.parse({
      ...base(event),
      status: event.status,
      scheduledDepartureAt: event.scheduledDepartureAt.toISOString(),
      departureAt: event.departureAt.toISOString(),
      arrivalAt: event.arrivalAt.toISOString(),
      delayed: event.delayed,
      change: event.change,
    }),
  }),
  FlightStatsChanged: (event: FlightStatsChanged) => ({
    room: SEARCH_ROOM,
    event: 'flight:stats',
    payload: FlightStatsEventSchema.parse({
      ...base(event),
      status: event.summary.status,
      departureAt: event.summary.departureAt.toISOString(),
      arrivalAt: event.summary.arrivalAt.toISOString(),
      delayed: event.summary.delayed,
      availableSeats: event.summary.counts.available,
      stats: event.summary.counts,
      change: event.change,
    }),
  }),
};

/**
 * Traduce un evento de dominio al contrato de `@kata/shared` (contracts/realtime-events.md) y lo
 * valida con su esquema: un payload inválido es un bug y falla aquí, no en el cliente. Los eventos
 * de asiento y `flight:updated` van al room del vuelo; `flight:stats`, solo al room `search`.
 * Ningún payload lleva el `clientId`: el dueño de un bloqueo viaja como `holderTag`.
 */
export function toRealtimeMessage(event: DomainEvent): RealtimeMessage {
  const map = MAPPERS[event.type] as (event: DomainEvent) => RealtimeMessage;
  return map(event);
}
