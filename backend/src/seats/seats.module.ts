import { Module } from '@nestjs/common';
import { FLIGHT_QUERY_PORT, FlightsModule, type FlightQueryPort } from '../flights';
import {
  FLIGHT_WRITE_CONTEXT,
  type FlightWriteContext,
} from '../shared-kernel/application/flight-write-context';
import { APP_CONFIG, type AppConfig } from '../shared-kernel/infrastructure/config';
import { GetMyHoldsUseCase } from './application/get-my-holds.use-case';
import { GetSeatMapUseCase } from './application/get-seat-map.use-case';
import { HoldSeatUseCase } from './application/hold-seat.use-case';
import { SEAT_BOOKING_PORT } from './application/ports/seat-booking.port';
import { SEAT_HOLDS_PORT, type SeatHoldsPort } from './application/ports/seat-holds.port';
import { SEAT_QUERY_PORT, type SeatQueryPort } from './application/ports/seat-query.port';
import { SEAT_RELEASE_PORT, type SeatReleasePort } from './application/ports/seat-release.port';
import { ReleaseExpiredHoldsUseCase } from './application/release-expired-holds.use-case';
import { ReleaseSeatUseCase } from './application/release-seat.use-case';
import { HoldSweeperJob } from './infrastructure/hold-sweeper.job';
import { SeatsController } from './infrastructure/http/seats.controller';
import { PrismaSeatBookingAdapter } from './infrastructure/persistence/prisma-seat-booking.adapter';
import { PrismaSeatHoldsAdapter } from './infrastructure/persistence/prisma-seat-holds.adapter';
import { PrismaSeatQueryAdapter } from './infrastructure/persistence/prisma-seat-query.adapter';
import { PrismaSeatReleaseAdapter } from './infrastructure/persistence/prisma-seat-release.adapter';

/**
 * Cada puerto → su adaptador; los casos de uso son clases planas registradas con `useFactory`
 * (D de SOLID: la aplicación no importa NestJS). Exporta los puertos que bookings y admin usan
 * dentro de su UnitOfWork.
 */
@Module({
  imports: [FlightsModule],
  controllers: [SeatsController],
  providers: [
    { provide: SEAT_HOLDS_PORT, useClass: PrismaSeatHoldsAdapter },
    { provide: SEAT_QUERY_PORT, useClass: PrismaSeatQueryAdapter },
    { provide: SEAT_BOOKING_PORT, useClass: PrismaSeatBookingAdapter },
    { provide: SEAT_RELEASE_PORT, useClass: PrismaSeatReleaseAdapter },
    {
      provide: HoldSeatUseCase,
      useFactory: (context: FlightWriteContext, holds: SeatHoldsPort, config: AppConfig) =>
        new HoldSeatUseCase(context, holds, { holdTtlSeconds: config.holdTtlSeconds }),
      inject: [FLIGHT_WRITE_CONTEXT, SEAT_HOLDS_PORT, APP_CONFIG],
    },
    {
      provide: ReleaseSeatUseCase,
      useFactory: (context: FlightWriteContext, holds: SeatHoldsPort) =>
        new ReleaseSeatUseCase(context, holds),
      inject: [FLIGHT_WRITE_CONTEXT, SEAT_HOLDS_PORT],
    },
    {
      provide: GetSeatMapUseCase,
      useFactory: (context: FlightWriteContext, flights: FlightQueryPort, seats: SeatQueryPort) =>
        new GetSeatMapUseCase(context.uow, flights, seats, context.clock),
      inject: [FLIGHT_WRITE_CONTEXT, FLIGHT_QUERY_PORT, SEAT_QUERY_PORT],
    },
    {
      provide: GetMyHoldsUseCase,
      useFactory: (context: FlightWriteContext, seats: SeatQueryPort) =>
        new GetMyHoldsUseCase(seats, context.clock),
      inject: [FLIGHT_WRITE_CONTEXT, SEAT_QUERY_PORT],
    },
    {
      provide: ReleaseExpiredHoldsUseCase,
      useFactory: (context: FlightWriteContext, releases: SeatReleasePort) =>
        new ReleaseExpiredHoldsUseCase(context, releases),
      inject: [FLIGHT_WRITE_CONTEXT, SEAT_RELEASE_PORT],
    },
    HoldSweeperJob,
  ],
  exports: [SEAT_BOOKING_PORT, SEAT_RELEASE_PORT],
})
export class SeatsModule {}
