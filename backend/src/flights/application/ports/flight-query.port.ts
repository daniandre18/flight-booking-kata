import type { AirportCode, FlightStatus } from '@kata/shared';

/** Lectura de vuelos (I de SOLID: separada de `FlightStatusPort`). */
export const FLIGHT_QUERY_PORT = Symbol('FlightQueryPort');

export interface FlightView {
  id: string;
  flightNumber: string;
  origin: AirportCode;
  destination: AirportCode;
  scheduledDepartureAt: Date;
  departureAt: Date;
  arrivalAt: Date;
  fare: number;
  status: FlightStatus;
  capacity: number;
  seq: number;
  /** Disponibles con vista perezosa, leídos en la misma sentencia que `seq`. */
  availableSeats: number;
}

export interface FlightSearchCriteria {
  origin: AirportCode;
  destination: AirportCode;
  /** Salida vigente desde (inclusive). */
  departureFrom: Date;
  /** Salida vigente hasta (exclusivo). */
  departureTo: Date;
  /** Instante de la vista perezosa de disponibles. */
  now: Date;
}

export interface FlightQueryPort {
  getById(flightId: string, now: Date): Promise<FlightView | null>;
  /** Vuelos de la ruta con salida vigente en el rango, incluidos los cancelados. */
  search(criteria: FlightSearchCriteria): Promise<FlightView[]>;
}
