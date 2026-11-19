import type { FlightChange, UpdateFlightStatusRequest } from '@kata/shared';
import {
  cancelFlight,
  delayFlight,
  flightUpdatedDraft,
  flightUpdatedEvents,
  type FlightQueryPort,
  type FlightSchedule,
  type FlightStatusPort,
  type FlightView,
} from '../../flights';
import { seatReleasedDrafts, seatReleasedEvents, type SeatReleasePort } from '../../seats';
import type { FlightWriteContext } from '../../shared-kernel/application/flight-write-context';
import {
  recordFlightChange,
  statsChangedEvent,
  type RecordedFlightChange,
} from '../../shared-kernel/application/record-flight-change';
import { DomainError } from '../../shared-kernel/domain/domain-error';

export interface ChangeFlightStatusCommand {
  flightId: string;
  request: UpdateFlightStatusRequest;
}

interface StatusOutcome extends RecordedFlightChange {
  next: FlightSchedule;
  change: FlightChange;
}

/**
 * Retraso o cancelación (HU4; research.md §14). Una UnitOfWork: lock del vuelo (`notCancelled`)
 * → reglas de transición del dominio → `flights` (FlightStatusPort) → al cancelar, libera todos
 * los bloqueos (SeatReleasePort) → `flight_events`. Publica solo tras el commit (principio II).
 * La lectura del vuelo ocurre con su fila ya bloqueada: nadie puede cambiarla entre medio.
 */
export class ChangeFlightStatusUseCase {
  constructor(
    private readonly context: FlightWriteContext,
    private readonly flightStatus: FlightStatusPort,
    private readonly seats: SeatReleasePort,
    private readonly flights: FlightQueryPort,
  ) {}

  async execute(command: ChangeFlightStatusCommand): Promise<FlightView> {
    const now = this.context.clock.now();
    const outcome = await this.context.uow.run(() => this.change(command, now));
    this.context.publisher.publish([
      ...flightUpdatedEvents(outcome.events, outcome.next, outcome.change),
      ...seatReleasedEvents(outcome.events, 'FLIGHT_CANCELLED'),
      ...statsChangedEvent(outcome.summary, now, outcome.change),
    ]);
    return this.requireFlight(command.flightId, now);
  }

  private async change(command: ChangeFlightStatusCommand, now: Date): Promise<StatusOutcome> {
    const { flightId, request } = command;
    await this.context.writeLock.acquire(flightId, 'notCancelled', now);
    const current = await this.requireFlight(flightId, now);
    let next: FlightSchedule;
    let released: string[] = [];
    if (request.status === 'DELAYED') {
      next = delayFlight(current, new Date(request.newDepartureAt));
      await this.flightStatus.delay(flightId, next);
    } else {
      next = cancelFlight(current);
      await this.flightStatus.cancel(flightId);
      released = await this.seats.releaseAllHeld(flightId);
    }
    const change: FlightChange = request.status;
    const drafts = [
      flightUpdatedDraft(next, change, now),
      ...seatReleasedDrafts(released, 'FLIGHT_CANCELLED', now),
    ];
    return { ...(await recordFlightChange(this.context, flightId, drafts)), next, change };
  }

  private async requireFlight(flightId: string, now: Date): Promise<FlightView> {
    const flight = await this.flights.getById(flightId, now);
    if (flight === null) {
      throw new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe');
    }
    return flight;
  }
}
