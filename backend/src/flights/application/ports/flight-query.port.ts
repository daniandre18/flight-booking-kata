import type { AirportCode, FlightStatus } from '@kata/shared';

/** Lectura de vuelos (I de SOLID: separada de `FlightStatusPort`). La fase 7 añade `search`. */
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

export interface FlightQueryPort {
  getById(flightId: string, now: Date): Promise<FlightView | null>;
}
