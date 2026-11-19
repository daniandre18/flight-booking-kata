import { z } from 'zod';
import { FlightChange, SeatStatus } from '../enums/index.js';
import { SeatCodeSchema } from '../domain/seat-code.js';
import {
  FlightStatusSchema,
  IsoDateTimeSchema,
  ReleaseReasonSchema,
  SeatCountsSchema,
} from '../schemas/flight.schema.js';
import { HolderTagSchema } from '../schemas/seat.schema.js';

/**
 * Catálogo de eventos Socket.io (contracts/realtime-events.md).
 * Room `flight:{id}`: eventos de asiento y `flight:updated`, con `seq` consecutiva.
 * Room `search`: solo `flight:stats`, un resumen por transacción.
 */

export const REALTIME_NAMESPACE = '/realtime';
export const SEARCH_ROOM = 'search';
export const flightRoom = (flightId: string): string => `flight:${flightId}`;

export const RealtimeEvents = {
  FlightJoin: 'flight:join',
  FlightLeave: 'flight:leave',
  SearchSubscribe: 'search:subscribe',
  SeatHeld: 'seat:held',
  SeatReleased: 'seat:released',
  SeatBooked: 'seat:booked',
  FlightUpdated: 'flight:updated',
  FlightStats: 'flight:stats',
} as const;

export const FlightChangeSchema = z.enum(FlightChange);

export const BaseEventSchema = z.object({
  flightId: z.uuid(),
  seq: z.int().nonnegative(),
  occurredAt: IsoDateTimeSchema,
});
export type BaseEvent = z.infer<typeof BaseEventSchema>;

export const SeatHeldEventSchema = BaseEventSchema.extend({
  seatId: SeatCodeSchema,
  status: z.literal(SeatStatus.HELD),
  holdExpiresAt: IsoDateTimeSchema,
  holderTag: HolderTagSchema,
});
export type SeatHeldEvent = z.infer<typeof SeatHeldEventSchema>;

export const SeatReleasedEventSchema = BaseEventSchema.extend({
  seatId: SeatCodeSchema,
  status: z.literal(SeatStatus.AVAILABLE),
  reason: ReleaseReasonSchema,
});
export type SeatReleasedEvent = z.infer<typeof SeatReleasedEventSchema>;

export const SeatBookedEventSchema = BaseEventSchema.extend({
  seatId: SeatCodeSchema,
  status: z.literal(SeatStatus.BOOKED),
});
export type SeatBookedEvent = z.infer<typeof SeatBookedEventSchema>;

export const FlightUpdatedEventSchema = BaseEventSchema.extend({
  status: FlightStatusSchema,
  departureAt: IsoDateTimeSchema,
  arrivalAt: IsoDateTimeSchema,
  scheduledDepartureAt: IsoDateTimeSchema,
  delayed: z.boolean(),
  change: FlightChangeSchema,
});
export type FlightUpdatedEvent = z.infer<typeof FlightUpdatedEventSchema>;

/** Resumen completo del vuelo, solo para el room `search`. */
export const FlightStatsEventSchema = BaseEventSchema.extend({
  status: FlightStatusSchema,
  departureAt: IsoDateTimeSchema,
  arrivalAt: IsoDateTimeSchema,
  delayed: z.boolean(),
  availableSeats: z.int().nonnegative(),
  stats: SeatCountsSchema,
  change: FlightChangeSchema.optional(),
});
export type FlightStatsEvent = z.infer<typeof FlightStatsEventSchema>;

export const FlightRoomPayloadSchema = z.object({ flightId: z.uuid() });
export type FlightRoomPayload = z.infer<typeof FlightRoomPayloadSchema>;

export interface RejectedAck {
  ok: false;
  code: 'FLIGHT_NOT_FOUND' | 'VALIDATION_ERROR';
}
export type FlightJoinAck = { ok: true; seq: number } | RejectedAck;
export type RoomAck = { ok: true } | RejectedAck;

export interface ServerToClientEvents {
  'seat:held': (event: SeatHeldEvent) => void;
  'seat:released': (event: SeatReleasedEvent) => void;
  'seat:booked': (event: SeatBookedEvent) => void;
  'flight:updated': (event: FlightUpdatedEvent) => void;
  'flight:stats': (event: FlightStatsEvent) => void;
}

export interface ClientToServerEvents {
  'flight:join': (payload: FlightRoomPayload, ack: (result: FlightJoinAck) => void) => void;
  'flight:leave': (payload: FlightRoomPayload, ack: (result: RoomAck) => void) => void;
  'search:subscribe': (payload: Record<string, never>, ack: (result: RoomAck) => void) => void;
}

/** Eventos del room del vuelo: forman una secuencia sin repeticiones de `seq`. */
export type FlightRoomEvent =
  | { type: 'seat:held'; data: SeatHeldEvent }
  | { type: 'seat:released'; data: SeatReleasedEvent }
  | { type: 'seat:booked'; data: SeatBookedEvent }
  | { type: 'flight:updated'; data: FlightUpdatedEvent };
