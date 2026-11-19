import { Module } from '@nestjs/common';
import {
  FLIGHT_QUERY_PORT,
  FLIGHT_STATUS_PORT,
  FlightsModule,
  type FlightQueryPort,
  type FlightStatusPort,
} from '../flights';
import { SEAT_RELEASE_PORT, SeatsModule, type SeatReleasePort } from '../seats';
import {
  FLIGHT_WRITE_CONTEXT,
  type FlightWriteContext,
} from '../shared-kernel/application/flight-write-context';
import { ChangeFlightStatusUseCase } from './application/change-flight-status.use-case';
import { AdminController } from './infrastructure/admin.controller';
import { AdminKeyGuard } from './infrastructure/admin-key.guard';

type AdminDependencies = [FlightWriteContext, FlightStatusPort, SeatReleasePort, FlightQueryPort];

/**
 * Administración (HU4). No escribe tablas propias: orquesta flights y seats a través de sus
 * puertos públicos dentro de una UnitOfWork (principio IV).
 */
@Module({
  imports: [FlightsModule, SeatsModule],
  controllers: [AdminController],
  providers: [
    AdminKeyGuard,
    {
      provide: ChangeFlightStatusUseCase,
      useFactory: (...[context, status, seats, flights]: AdminDependencies) =>
        new ChangeFlightStatusUseCase(context, status, seats, flights),
      inject: [FLIGHT_WRITE_CONTEXT, FLIGHT_STATUS_PORT, SEAT_RELEASE_PORT, FLIGHT_QUERY_PORT],
    },
  ],
})
export class AdminModule {}
