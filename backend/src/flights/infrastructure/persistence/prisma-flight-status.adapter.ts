import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import { type FlightStatusPort } from '../../application/ports/flight-status.port';

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
}
