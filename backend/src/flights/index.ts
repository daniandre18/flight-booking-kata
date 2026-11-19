/**
 * API pública del módulo flights: lo único que otros módulos pueden importar (principio IV).
 * Se amplía con las reglas de dominio del vuelo en la fase 7.
 */
export { FLIGHT_REPOSITORY, type FlightRepository } from './application/ports/flight.repository';
export { FlightsModule } from './flights.module';
