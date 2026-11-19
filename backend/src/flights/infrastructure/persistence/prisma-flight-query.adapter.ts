import { Injectable } from '@nestjs/common';
import type { AirportCode, FlightStatus } from '@kata/shared';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import { isUuid } from '../../../shared-kernel/infrastructure/persistence/uuid';
import {
  type FlightQueryPort,
  type FlightSearchCriteria,
  type FlightView,
} from '../../application/ports/flight-query.port';

interface FlightRow {
  id: string;
  flight_number: string;
  origin: AirportCode;
  destination: AirportCode;
  scheduled_departure_at: Date;
  departure_at: Date;
  arrival_at: Date;
  fare: number;
  status: FlightStatus;
  capacity: number;
  seq: bigint;
  available_seats: number;
}

/**
 * Vuelo con `seq` y disponibles con vista perezosa (HELD vencido = disponible). Una sola
 * sentencia: `seq` y conteo salen del mismo snapshot (research.md §13). Fragmento único (DRY).
 */
function flightSelect(now: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT f.id, f.flight_number, f.origin, f.destination, f.scheduled_departure_at,
           f.departure_at, f.arrival_at, f.fare, f.status::text AS status,
           f.capacity::int AS capacity, f.seq,
           (COUNT(s.id) FILTER (
             WHERE s.status = 'AVAILABLE' OR (s.status = 'HELD' AND s.hold_expires_at <= ${now})
           ))::int AS available_seats
    FROM flights f
    LEFT JOIN seats s ON s.flight_id = f.id`;
}

@Injectable()
export class PrismaFlightQueryAdapter implements FlightQueryPort {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async getById(flightId: string, now: Date): Promise<FlightView | null> {
    if (!isUuid(flightId)) {
      return null;
    }
    const rows = await this.uow.currentTx().$queryRaw<FlightRow[]>`
      ${flightSelect(now)}
      WHERE f.id = ${flightId}::uuid
      GROUP BY f.id`;
    const row = rows[0];
    return row === undefined ? null : toFlightView(row);
  }

  /** Usa el índice `(origin, destination, departure_at)`. */
  async search(criteria: FlightSearchCriteria): Promise<FlightView[]> {
    const rows = await this.uow.currentTx().$queryRaw<FlightRow[]>`
      ${flightSelect(criteria.now)}
      WHERE f.origin = ${criteria.origin}
        AND f.destination = ${criteria.destination}
        AND f.departure_at >= ${criteria.departureFrom}
        AND f.departure_at < ${criteria.departureTo}
      GROUP BY f.id
      ORDER BY f.departure_at, f.flight_number`;
    return rows.map(toFlightView);
  }
}

function toFlightView(row: FlightRow): FlightView {
  return {
    id: row.id,
    flightNumber: row.flight_number,
    origin: row.origin,
    destination: row.destination,
    scheduledDepartureAt: row.scheduled_departure_at,
    departureAt: row.departure_at,
    arrivalAt: row.arrival_at,
    fare: row.fare,
    status: row.status,
    capacity: row.capacity,
    seq: Number(row.seq),
    availableSeats: row.available_seats,
  };
}
