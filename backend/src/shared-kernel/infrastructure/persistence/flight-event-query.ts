import { Injectable } from '@nestjs/common';
import type { FlightEventType } from '@kata/shared';
import type { EventPayload, RecordedFlightEvent } from '../../application/flight-event-log.port';
import type { FlightEventQueryPort } from '../../application/flight-event-query.port';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { isUuid } from './uuid';

/** Usa la PK `(flight_id, seq)`: recorrido inverso del índice, sin ordenar en memoria. */
@Injectable()
export class PrismaFlightEventQuery implements FlightEventQueryPort {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async recent(flightId: string, limit: number): Promise<RecordedFlightEvent[]> {
    if (!isUuid(flightId)) {
      return [];
    }
    const rows = await this.uow.currentTx().flightEvent.findMany({
      where: { flightId },
      orderBy: { seq: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      flightId: row.flightId,
      seq: Number(row.seq),
      type: row.type as FlightEventType,
      seatCode: row.seatCode,
      payload: row.payload as EventPayload,
      occurredAt: row.occurredAt,
    }));
  }
}
