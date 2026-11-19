import { Injectable } from '@nestjs/common';
import { type FlightStatus } from '@kata/shared';
import {
  type FlightStatsReader,
  type FlightSummary,
} from '../../application/flight-stats-reader.port';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { isUuid } from './uuid';

interface SummaryRow {
  id: string;
  seq: bigint;
  status: FlightStatus;
  scheduled_departure_at: Date;
  departure_at: Date;
  arrival_at: Date;
  total: number;
  booked: number;
  held: number;
}

/**
 * Resumen del vuelo con vista perezosa: un HELD vencido cuenta como disponible.
 * `seq` y conteos salen de una sola sentencia, que PostgreSQL evalúa sobre un único snapshot
 * (equivalente a leerlos en REPEATABLE READ, research.md §13).
 */
@Injectable()
export class PrismaFlightStatsReader implements FlightStatsReader {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async summary(flightId: string, now: Date): Promise<FlightSummary | null> {
    if (!isUuid(flightId)) {
      return null;
    }
    const rows = await this.uow.currentTx().$queryRaw<SummaryRow[]>`
      SELECT f.id, f.seq, f.status::text AS status, f.scheduled_departure_at, f.departure_at,
             f.arrival_at,
             COUNT(s.id)::int AS total,
             (COUNT(s.id) FILTER (WHERE s.status = 'BOOKED'))::int AS booked,
             (COUNT(s.id) FILTER (WHERE s.status = 'HELD' AND s.hold_expires_at > ${now}))::int AS held
      FROM flights f
      LEFT JOIN seats s ON s.flight_id = f.id
      WHERE f.id = ${flightId}::uuid
      GROUP BY f.id`;
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      flightId: row.id,
      seq: Number(row.seq),
      status: row.status,
      scheduledDepartureAt: row.scheduled_departure_at,
      departureAt: row.departure_at,
      arrivalAt: row.arrival_at,
      delayed: row.departure_at.getTime() > row.scheduled_departure_at.getTime(),
      counts: {
        total: row.total,
        booked: row.booked,
        held: row.held,
        available: row.total - row.booked - row.held,
      },
    };
  }
}
