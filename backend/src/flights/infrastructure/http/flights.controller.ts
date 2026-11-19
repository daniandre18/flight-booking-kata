import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  FlightEventsQuerySchema,
  FlightParamsSchema,
  type ActivityEntryDto,
  type FlightDto,
  type FlightStatsDto,
  type SearchFlightsQuery,
} from '@kata/shared';
import { createZodDto } from 'nestjs-zod';
import { toActivityEntryDto, toFlightDto } from '../../application/flight-dto.mapper';
import { GetFlightEventsUseCase } from '../../application/get-flight-events.use-case';
import { GetFlightStatsUseCase } from '../../application/get-flight-stats.use-case';
import { GetFlightUseCase } from '../../application/get-flight.use-case';
import { SearchFlightsUseCase } from '../../application/search-flights.use-case';
import { SearchFlightsQueryPipe } from './search-flights-query.pipe';

class FlightParamsDto extends createZodDto(FlightParamsSchema) {}
class FlightEventsQueryDto extends createZodDto(FlightEventsQuerySchema) {}

/** Traduce HTTP ↔ casos de uso; sin lógica de negocio (S de SOLID). contracts/openapi.yaml. */
@Controller('flights')
export class FlightsController {
  constructor(
    private readonly searchFlights: SearchFlightsUseCase,
    private readonly getFlight: GetFlightUseCase,
    private readonly getStats: GetFlightStatsUseCase,
    private readonly getEvents: GetFlightEventsUseCase,
  ) {}

  @Get()
  async search(@Query(SearchFlightsQueryPipe) query: SearchFlightsQuery): Promise<FlightDto[]> {
    const flights = await this.searchFlights.execute(query);
    return flights.map(toFlightDto);
  }

  @Get(':flightId')
  async detail(@Param() params: FlightParamsDto): Promise<FlightDto> {
    return toFlightDto(await this.getFlight.execute(params.flightId));
  }

  @Get(':flightId/stats')
  stats(@Param() params: FlightParamsDto): Promise<FlightStatsDto> {
    return this.getStats.execute(params.flightId);
  }

  @Get(':flightId/events')
  async events(
    @Param() params: FlightParamsDto,
    @Query() query: FlightEventsQueryDto,
  ): Promise<ActivityEntryDto[]> {
    const entries = await this.getEvents.execute(params.flightId, query.limit);
    return entries.map(toActivityEntryDto);
  }
}
