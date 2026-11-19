import type { FlightChange, FlightStatus, ReleaseReason } from '@kata/shared';
import type { FlightSummary } from './flight-stats-reader.port';

/**
 * Eventos de dominio. Los casos de uso los publican solo después del commit (principio II);
 * el gateway de tiempo real los traduce a los eventos de `@kata/shared`.
 */
export const EVENT_PUBLISHER = Symbol('EventPublisher');

interface BaseDomainEvent {
  flightId: string;
  seq: number;
  occurredAt: Date;
}

export interface SeatHeld extends BaseDomainEvent {
  type: 'SeatHeld';
  seatCode: string;
  holdExpiresAt: Date;
  holderTag: string;
}

export interface SeatReleased extends BaseDomainEvent {
  type: 'SeatReleased';
  seatCode: string;
  reason: ReleaseReason;
}

export interface SeatBooked extends BaseDomainEvent {
  type: 'SeatBooked';
  seatCode: string;
}

export interface FlightUpdated extends BaseDomainEvent {
  type: 'FlightUpdated';
  status: FlightStatus;
  scheduledDepartureAt: Date;
  departureAt: Date;
  arrivalAt: Date;
  delayed: boolean;
  change: FlightChange;
}

/** Resumen por transacción para el room `search` (`seq` = última de la transacción). */
export interface FlightStatsChanged extends BaseDomainEvent {
  type: 'FlightStatsChanged';
  summary: FlightSummary;
  change?: FlightChange;
}

export type DomainEvent = SeatHeld | SeatReleased | SeatBooked | FlightUpdated | FlightStatsChanged;

export const domainEventName = (type: DomainEvent['type']): string => `domain.${type}`;

export interface EventPublisher {
  publish(events: readonly DomainEvent[]): void;
}
