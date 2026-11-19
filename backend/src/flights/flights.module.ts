import { Module } from '@nestjs/common';
import { FLIGHT_REPOSITORY } from './application/ports/flight.repository';
import { PrismaFlightRepository } from './infrastructure/prisma-flight.repository';

@Module({
  providers: [{ provide: FLIGHT_REPOSITORY, useClass: PrismaFlightRepository }],
  exports: [FLIGHT_REPOSITORY],
})
export class FlightsModule {}
