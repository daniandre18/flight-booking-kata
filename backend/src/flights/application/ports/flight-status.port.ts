/**
 * Puerto de escritura del estado del vuelo (I de SOLID: separado de `FlightQueryPort`).
 * Solo escribe la tabla `flights`; se ejecuta dentro de la UnitOfWork del caso de uso, que ya tomó
 * el lock de la fila del vuelo.
 */
export const FLIGHT_STATUS_PORT = Symbol('FlightStatusPort');

export interface FlightReschedule {
  departureAt: Date;
  arrivalAt: Date;
}

export interface FlightStatusPort {
  /** Pasa el vuelo a SOLD_OUT si ya no quedan asientos sin reservar. `true` si cambió. */
  markSoldOutIfFull(flightId: string): Promise<boolean>;
  /** Nuevas horas; DELAYED salvo SOLD_OUT, que se conserva. Nunca sobre un cancelado. */
  delay(flightId: string, schedule: FlightReschedule): Promise<boolean>;
  /** CANCELLED (terminal). `false` si ya estaba cancelado. */
  cancel(flightId: string): Promise<boolean>;
}
