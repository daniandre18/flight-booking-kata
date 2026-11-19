import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import { type FlightRepository } from '../application/ports/flight.repository';

@Injectable()
export class PrismaFlightRepository implements FlightRepository {
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
}
