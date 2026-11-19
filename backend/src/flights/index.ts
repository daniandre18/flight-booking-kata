/**
 * API pública del módulo flights: lo único que otros módulos pueden importar (principio IV).
 */
export { toFlightDto } from './application/flight-dto.mapper';
export {
  FLIGHT_QUERY_PORT,
  type FlightQueryPort,
  type FlightView,
} from './application/ports/flight-query.port';
export { FLIGHT_STATUS_PORT, type FlightStatusPort } from './application/ports/flight-status.port';
export { FlightsModule } from './flights.module';
