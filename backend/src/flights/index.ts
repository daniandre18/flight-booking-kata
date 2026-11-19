/**
 * API pública del módulo flights: lo único que otros módulos pueden importar (principio IV).
 */
export { toFlightDto } from './application/flight-dto.mapper';
export { cancelFlight, delayFlight, isDelayed, type FlightSchedule } from './domain/flight';
export { flightUpdatedDraft, flightUpdatedEvents } from './application/flight-updated-events';
export {
  FLIGHT_QUERY_PORT,
  type FlightQueryPort,
  type FlightSearchCriteria,
  type FlightView,
} from './application/ports/flight-query.port';
export {
  FLIGHT_STATUS_PORT,
  type FlightReschedule,
  type FlightStatusPort,
} from './application/ports/flight-status.port';
export { FlightsModule } from './flights.module';
