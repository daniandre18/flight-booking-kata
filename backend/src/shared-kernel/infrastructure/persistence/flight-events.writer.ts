import { Injectable } from '@nestjs/common';
import {
  type FlightEventDraft,
  type FlightEventLog,
  type RecordedFlightEvent,
} from '../../application/flight-event-log.port';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

/**
 * Asigna `seq` consecutivas avanzando `flights.seq` sobre la fila ya bloqueada e inserta los
 * eventos en `flight_events` (data-model.md). Si la transacción falla, el rollback lo deshace todo.
 */
@Injectable()
export class PrismaFlightEventLog implements FlightEventLog {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async append(
    flightId: string,
    drafts: readonly FlightEventDraft[],
  ): Promise<RecordedFlightEvent[]> {
    if (drafts.length === 0) {
      return [];
    }
    const tx = this.uow.requireTx();
    const rows = await tx.$queryRaw<{ seq: bigint }[]>`
      UPDATE flights SET seq = seq + ${drafts.length} WHERE id = ${flightId}::uuid RETURNING seq`;
    const last = rows[0];
    if (last === undefined) {
      throw new Error(`No se pudo asignar seq: el vuelo ${flightId} no existe`);
    }
    const firstSeq = Number(last.seq) - drafts.length + 1;
    const recorded = drafts.map((draft, index) => ({ ...draft, flightId, seq: firstSeq + index }));
    await tx.flightEvent.createMany({
      data: recorded.map((event) => ({
        flightId,
        seq: BigInt(event.seq),
        type: event.type,
        seatCode: event.seatCode,
        payload: {
          ...event.payload,
          flightId,
          seq: event.seq,
          occurredAt: event.occurredAt.toISOString(),
        },
        occurredAt: event.occurredAt,
      })),
    });
    return recorded;
  }
}
