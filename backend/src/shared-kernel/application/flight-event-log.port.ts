import type { FlightEventType } from '@kata/shared';

/** Registro de eventos del vuelo (research.md §13): asigna `seq` consecutivas y los persiste. */
export const FLIGHT_EVENT_LOG = Symbol('FlightEventLog');

export type EventPayload = Record<string, string | number | boolean | null>;

export interface FlightEventDraft {
  type: FlightEventType;
  seatCode: string | null;
  payload: EventPayload;
  occurredAt: Date;
}

export interface RecordedFlightEvent extends FlightEventDraft {
  flightId: string;
  seq: number;
}

export interface FlightEventLog {
  /** Avanza `flights.seq` en n (fila ya bloqueada) e inserta los n eventos numerados. */
  append(flightId: string, drafts: readonly FlightEventDraft[]): Promise<RecordedFlightEvent[]>;
}
