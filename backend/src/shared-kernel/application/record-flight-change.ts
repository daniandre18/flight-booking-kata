import type { FlightChange } from '@kata/shared';
import type { FlightStatsChanged } from './event-publisher';
import type { FlightEventDraft, RecordedFlightEvent } from './flight-event-log.port';
import type { FlightSummary } from './flight-stats-reader.port';
import type { FlightWriteContext } from './flight-write-context';

export interface RecordedFlightChange {
  events: RecordedFlightEvent[];
  summary: FlightSummary | null;
}

/**
 * Registra los eventos de una operación y lee el resumen del vuelo en la misma transacción
 * (DRY: lo usan todos los casos de uso que escriben). Debe llamarse dentro de `uow.run`.
 */
export async function recordFlightChange(
  context: FlightWriteContext,
  flightId: string,
  drafts: FlightEventDraft[],
): Promise<RecordedFlightChange> {
  const events = await context.eventLog.append(flightId, drafts);
  const occurredAt = drafts[0]?.occurredAt ?? context.clock.now();
  const summary = await context.statsReader.summary(flightId, occurredAt);
  return { events, summary };
}

/** Evento de resumen para el room `search` (uno por transacción, research.md §13). */
export function statsChangedEvent(
  summary: FlightSummary | null,
  occurredAt: Date,
  change?: FlightChange,
): FlightStatsChanged[] {
  if (summary === null) {
    return [];
  }
  const event: FlightStatsChanged = {
    type: 'FlightStatsChanged',
    flightId: summary.flightId,
    seq: summary.seq,
    occurredAt,
    summary,
  };
  return [change === undefined ? event : { ...event, change }];
}
