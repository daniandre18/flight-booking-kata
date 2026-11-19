/** Puerto del módulo flights; solo escribe la tabla `flights`. Se amplía en las fases 7 y 9. */
export const FLIGHT_REPOSITORY = Symbol('FlightRepository');

export interface FlightRepository {
  /**
   * Pasa el vuelo a SOLD_OUT si ya no quedan asientos sin reservar (research.md §14).
   * Debe ejecutarse dentro de la UnitOfWork de la confirmación. Devuelve `true` si cambió.
   */
  markSoldOutIfFull(flightId: string): Promise<boolean>;
}
