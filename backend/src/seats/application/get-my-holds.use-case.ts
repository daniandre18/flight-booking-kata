import type { Clock } from '../../shared-kernel/domain/clock';
import { holderTagOf } from '../../shared-kernel/domain/holder-tag';
import type { ClientHoldGroup, SeatQueryPort } from './ports/seat-query.port';

export interface MyHoldsResult {
  holderTag: string;
  serverNow: Date;
  holds: ClientHoldGroup[];
}

/** Bloqueos vigentes del cliente para recuperarlos al recargar (RF-014). */
export class GetMyHoldsUseCase {
  constructor(
    private readonly seats: SeatQueryPort,
    private readonly clock: Clock,
  ) {}

  async execute(clientId: string): Promise<MyHoldsResult> {
    const now = this.clock.now();
    const holds = await this.seats.getClientHolds(clientId, now);
    return { holderTag: holderTagOf(clientId), serverNow: now, holds };
  }
}
