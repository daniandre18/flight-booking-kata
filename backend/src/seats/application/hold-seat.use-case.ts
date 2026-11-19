import { type SeatPosition } from '@kata/shared';
import type { FlightWriteContext } from '../../shared-kernel/application/flight-write-context';
import {
  recordFlightChange,
  statsChangedEvent,
  type RecordedFlightChange,
} from '../../shared-kernel/application/record-flight-change';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import { holderTagOf } from '../../shared-kernel/domain/holder-tag';
import { assertCanHoldMore, computeHoldExpiry } from '../domain/hold-policy';
import { requireSeatPosition } from '../domain/seat-position';
import type { SeatHoldsPort } from './ports/seat-holds.port';

export interface HoldSeatCommand {
  flightId: string;
  seatCode: string;
  clientId: string;
}

export interface HoldSeatResult {
  flightId: string;
  seatCode: string;
  holdExpiresAt: Date;
  holderTag: string;
  seq: number;
  serverNow: Date;
}

export interface HoldPolicyConfig {
  holdTtlSeconds: number;
}

interface HoldOutcome extends RecordedFlightChange {
  holdExpiresAt: Date;
}

/**
 * Bloquea un asiento (HU2). Orden de locks: vuelo → advisory del cliente → asiento (research.md
 * §6–§7); la propiedad la decide el UPDATE condicional del adaptador. Publica tras el commit.
 */
export class HoldSeatUseCase {
  constructor(
    private readonly context: FlightWriteContext,
    private readonly holds: SeatHoldsPort,
    private readonly config: HoldPolicyConfig,
  ) {}

  async execute(command: HoldSeatCommand): Promise<HoldSeatResult> {
    const now = this.context.clock.now();
    const seat = requireSeatPosition(command.seatCode);
    const holderTag = holderTagOf(command.clientId);
    const outcome = await this.context.uow.run(() => this.hold(command, seat, now));
    this.publish(command, outcome, now, holderTag);
    const seq = outcome.events[0]?.seq ?? 0;
    return { ...command, holdExpiresAt: outcome.holdExpiresAt, holderTag, seq, serverNow: now };
  }

  private async hold(
    command: HoldSeatCommand,
    seat: SeatPosition,
    now: Date,
  ): Promise<HoldOutcome> {
    const { flightId, clientId } = command;
    await this.context.writeLock.acquire(flightId, 'bookable', now);
    const summary = await this.holds.lockClientHolds(flightId, clientId, now);
    assertCanHoldMore(summary.activeCount);
    const holdExpiresAt = computeHoldExpiry(
      summary.sharedExpiresAt,
      now,
      this.config.holdTtlSeconds,
    );
    const won = await this.holds.holdIfAvailable({
      flightId,
      seat,
      clientId,
      now,
      expiresAt: holdExpiresAt,
    });
    if (!won) {
      throw new DomainError('SEAT_UNAVAILABLE', 'Este asiento ya no está disponible');
    }
    const payload = {
      seatId: command.seatCode,
      status: 'HELD',
      holdExpiresAt: holdExpiresAt.toISOString(),
      holderTag: holderTagOf(clientId),
    };
    const draft = {
      type: 'SEAT_HELD' as const,
      seatCode: command.seatCode,
      payload,
      occurredAt: now,
    };
    return { ...(await recordFlightChange(this.context, flightId, [draft])), holdExpiresAt };
  }

  private publish(
    command: HoldSeatCommand,
    outcome: HoldOutcome,
    now: Date,
    holderTag: string,
  ): void {
    const seatEvents = outcome.events.map((event) => ({
      type: 'SeatHeld' as const,
      flightId: command.flightId,
      seq: event.seq,
      occurredAt: now,
      seatCode: command.seatCode,
      holdExpiresAt: outcome.holdExpiresAt,
      holderTag,
    }));
    this.context.publisher.publish([...seatEvents, ...statsChangedEvent(outcome.summary, now)]);
  }
}
