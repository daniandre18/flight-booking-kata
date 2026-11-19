import type { FlightWriteContext } from '../../shared-kernel/application/flight-write-context';
import {
  recordFlightChange,
  statsChangedEvent,
  type RecordedFlightChange,
} from '../../shared-kernel/application/record-flight-change';
import type { SeatReleasePort } from './ports/seat-release.port';
import { seatReleasedDrafts, seatReleasedEvents } from './seat-released-events';

export interface SweepFailure {
  flightId: string;
  error: unknown;
}

export interface SweepResult {
  /** Asientos liberados en la pasada. */
  released: number;
  /** Vuelos cuya liberación falló; los demás se procesaron igual. */
  failures: SweepFailure[];
}

/**
 * Libera los bloqueos vencidos y lo notifica (RF-012, RF-032; research.md §11). Una transacción
 * por vuelo: lock del vuelo → UPDATE condicional → eventos; publica tras cada commit.
 */
export class ReleaseExpiredHoldsUseCase {
  constructor(
    private readonly context: FlightWriteContext,
    private readonly releases: SeatReleasePort,
  ) {}

  async execute(): Promise<SweepResult> {
    const now = this.context.clock.now();
    const flightIds = await this.releases.findFlightsWithExpiredHolds(now);
    const result: SweepResult = { released: 0, failures: [] };
    for (const flightId of flightIds) {
      try {
        result.released += await this.releaseFlight(flightId, now);
      } catch (error) {
        result.failures.push({ flightId, error });
      }
    }
    return result;
  }

  private async releaseFlight(flightId: string, now: Date): Promise<number> {
    const outcome = await this.context.uow.run(async (): Promise<RecordedFlightChange> => {
      await this.context.writeLock.acquire(flightId, 'any', now);
      const seatCodes = await this.releases.releaseExpired(flightId, now);
      // Si otra operación ya los tomó o liberó, no hay nada que registrar.
      const drafts = seatReleasedDrafts(seatCodes, 'EXPIRED', now);
      return drafts.length === 0
        ? { events: [], summary: null }
        : recordFlightChange(this.context, flightId, drafts);
    });
    this.context.publisher.publish([
      ...seatReleasedEvents(outcome.events, 'EXPIRED'),
      ...statsChangedEvent(outcome.summary, now),
    ]);
    return outcome.events.length;
  }
}
