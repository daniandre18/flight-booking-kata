import { Module } from '@nestjs/common';
import { CLOCK, type Clock } from '../shared-kernel/domain/clock';
import { GetFlightUseCase } from './application/get-flight.use-case';
import { FLIGHT_QUERY_PORT, type FlightQueryPort } from './application/ports/flight-query.port';
import { FLIGHT_STATUS_PORT } from './application/ports/flight-status.port';
import { SearchFlightsUseCase } from './application/search-flights.use-case';
import { FlightsController } from './infrastructure/http/flights.controller';
import { SearchFlightsQueryPipe } from './infrastructure/http/search-flights-query.pipe';
import { PrismaFlightQueryAdapter } from './infrastructure/persistence/prisma-flight-query.adapter';
import { PrismaFlightStatusAdapter } from './infrastructure/persistence/prisma-flight-status.adapter';

/**
 * Vuelos (HU1). Escribe solo la tabla `flights`. Los casos de uso son clases planas registradas
 * con `useFactory` (D de SOLID). Exporta los puertos que seats, bookings y admin usan.
 */
@Module({
  controllers: [FlightsController],
  providers: [
    { provide: FLIGHT_STATUS_PORT, useClass: PrismaFlightStatusAdapter },
    { provide: FLIGHT_QUERY_PORT, useClass: PrismaFlightQueryAdapter },
    SearchFlightsQueryPipe,
    {
      provide: SearchFlightsUseCase,
      useFactory: (flights: FlightQueryPort, clock: Clock) =>
        new SearchFlightsUseCase(flights, clock),
      inject: [FLIGHT_QUERY_PORT, CLOCK],
    },
    {
      provide: GetFlightUseCase,
      useFactory: (flights: FlightQueryPort, clock: Clock) => new GetFlightUseCase(flights, clock),
      inject: [FLIGHT_QUERY_PORT, CLOCK],
    },
  ],
  exports: [FLIGHT_STATUS_PORT, FLIGHT_QUERY_PORT],
})
export class FlightsModule {}
