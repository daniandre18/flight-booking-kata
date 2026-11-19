import { Module } from '@nestjs/common';
import { FLIGHT_QUERY_PORT } from './application/ports/flight-query.port';
import { FLIGHT_STATUS_PORT } from './application/ports/flight-status.port';
import { PrismaFlightQueryAdapter } from './infrastructure/persistence/prisma-flight-query.adapter';
import { PrismaFlightStatusAdapter } from './infrastructure/persistence/prisma-flight-status.adapter';

@Module({
  providers: [
    { provide: FLIGHT_STATUS_PORT, useClass: PrismaFlightStatusAdapter },
    { provide: FLIGHT_QUERY_PORT, useClass: PrismaFlightQueryAdapter },
  ],
  exports: [FLIGHT_STATUS_PORT, FLIGHT_QUERY_PORT],
})
export class FlightsModule {}
