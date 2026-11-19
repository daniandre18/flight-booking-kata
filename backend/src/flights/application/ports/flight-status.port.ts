/**
 * Puerto de escritura del estado del vuelo (I de SOLID: separado de `FlightQueryPort`).
 * Solo escribe la tabla `flights`; se ejecuta dentro de la UnitOfWork del caso de uso.
 * Se amplía con `delay` y `cancel` en la fase 9.
 */
export const FLIGHT_STATUS_PORT = Symbol('FlightStatusPort');

export interface FlightStatusPort {
  /** Pasa el vuelo a SOLD_OUT si ya no quedan asientos sin reservar. `true` si cambió. */
  markSoldOutIfFull(flightId: string): Promise<boolean>;
}
