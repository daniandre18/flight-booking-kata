import type { FlightWriteContext } from '../../shared-kernel/application/flight-write-context';
import {
  recordFlightChange,
  statsChangedEvent,
  type RecordedFlightChange,
} from '../../shared-kernel/application/record-flight-change';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import { requireSeatPosition } from '../domain/seat-position';
import type { SeatHoldsPort } from './ports/seat-holds.port';

export interface ReleaseSeatCommand {
  flightId: string;
  seatCode: string;
  clientId: string;
}

/** Libera un asiento bloqueado por el propio cliente (RF-011). Publica tras el commit. */
export class ReleaseSeatUseCase {
  constructor(
    private readonly context: FlightWriteContext,
    private readonly holds: SeatHoldsPort,
  ) {}

  async execute(command: ReleaseSeatCommand): Promise<void> {
    const now = this.context.clock.now();
    const seat = requireSeatPosition(command.seatCode);
    const outcome = await this.context.uow.run(async (): Promise<RecordedFlightChange> => {
      await this.context.writeLock.acquire(command.flightId, 'any', now);
      const released = await this.holds.releaseIfOwned({ ...command, seat, now });
      if (!released) {
        throw new DomainError('SEAT_NOT_HELD', 'Este asiento no está bloqueado a tu nombre');
      }
      const payload = { seatId: command.seatCode, status: 'AVAILABLE', reason: 'MANUAL' };
      const draft = {
        type: 'SEAT_RELEASED' as const,
        seatCode: command.seatCode,
        payload,
        occurredAt: now,
      };
      return recordFlightChange(this.context, command.flightId, [draft]);
    });
    const seatEvents = outcome.events.map((event) => ({
      type: 'SeatReleased' as const,
      flightId: command.flightId,
      seq: event.seq,
      occurredAt: now,
      seatCode: command.seatCode,
      reason: 'MANUAL' as const,
    }));
    this.context.publisher.publish([...seatEvents, ...statsChangedEvent(outcome.summary, now)]);
  }
}
