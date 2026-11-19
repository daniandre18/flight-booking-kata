import type { Clock } from '../../shared-kernel/domain/clock';
import { holderTagOf } from '../../shared-kernel/domain/holder-tag';
import type { ClientHoldGroup, SeatQueryPort } from './ports/seat-query.port';

export interface MyHoldsResult {
  holderTag: string;
  serverNow: Date;
  holds: ClientHoldGroup[];
}

/** Bloqueos vigentes del cliente para recuperarlos al recargar (RF-014); opcionalmente de un vuelo. */
export class GetMyHoldsUseCase {
  constructor(
    private readonly seats: SeatQueryPort,
    private readonly clock: Clock,
  ) {}

  async execute(clientId: string, flightId?: string): Promise<MyHoldsResult> {
    const now = this.clock.now();
    const all = await this.seats.getClientHolds(clientId, now);
    const holds = flightId === undefined ? all : all.filter((group) => group.flightId === flightId);
    return { holderTag: holderTagOf(clientId), serverNow: now, holds };
  }
}
