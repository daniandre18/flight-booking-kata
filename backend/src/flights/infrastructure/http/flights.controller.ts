import { Controller, Get, Param, Query } from '@nestjs/common';
import { FlightParamsSchema, type FlightDto, type SearchFlightsQuery } from '@kata/shared';
import { createZodDto } from 'nestjs-zod';
import { toFlightDto } from '../../application/flight-dto.mapper';
import { GetFlightUseCase } from '../../application/get-flight.use-case';
import { SearchFlightsUseCase } from '../../application/search-flights.use-case';
import { SearchFlightsQueryPipe } from './search-flights-query.pipe';

class FlightParamsDto extends createZodDto(FlightParamsSchema) {}

/** Traduce HTTP ↔ casos de uso; sin lógica de negocio (S de SOLID). contracts/openapi.yaml. */
@Controller('flights')
export class FlightsController {
  constructor(
    private readonly searchFlights: SearchFlightsUseCase,
    private readonly getFlight: GetFlightUseCase,
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
}
