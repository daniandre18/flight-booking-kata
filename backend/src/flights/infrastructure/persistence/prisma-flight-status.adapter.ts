import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import {
  type FlightReschedule,
  type FlightStatusPort,
} from '../../application/ports/flight-status.port';

/** Cada método es un UPDATE condicional: la condición y la escritura van en una sentencia. */
@Injectable()
export class PrismaFlightStatusAdapter implements FlightStatusPort {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async markSoldOutIfFull(flightId: string): Promise<boolean> {
    // Una sola sentencia condicional: decide y escribe sin leer antes (principio I).
    const changed = await this.uow.requireTx().$executeRaw`
      UPDATE flights SET status = 'SOLD_OUT', updated_at = now()
      WHERE id = ${flightId}::uuid
        AND status IN ('SCHEDULED', 'DELAYED')
        AND NOT EXISTS (
          SELECT 1 FROM seats WHERE flight_id = ${flightId}::uuid AND status <> 'BOOKED'
        )`;
    return changed === 1;
  }

  async delay(flightId: string, schedule: FlightReschedule): Promise<boolean> {
    const changed = await this.uow.requireTx().$executeRaw`
      UPDATE flights
      SET departure_at = ${schedule.departureAt},
          arrival_at = ${schedule.arrivalAt},
          status = CASE WHEN status = 'SOLD_OUT' THEN status ELSE 'DELAYED' END,
          updated_at = now()
      WHERE id = ${flightId}::uuid AND status <> 'CANCELLED'`;
    return changed === 1;
  }

  async cancel(flightId: string): Promise<boolean> {
    const changed = await this.uow.requireTx().$executeRaw`
      UPDATE flights SET status = 'CANCELLED', updated_at = now()
      WHERE id = ${flightId}::uuid AND status <> 'CANCELLED'`;
    return changed === 1;
  }
}
