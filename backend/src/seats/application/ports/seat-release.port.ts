/** Liberación masiva de bloqueos (I de SOLID): vencimientos y cancelación. Fases 6 y 9. */
export const SEAT_RELEASE_PORT = Symbol('SeatReleasePort');

export interface SeatReleasePort {
  findFlightsWithExpiredHolds(now: Date): Promise<string[]>;
  /** Devuelve los códigos de asiento liberados. */
  releaseExpired(flightId: string, now: Date): Promise<string[]>;
  releaseAllHeld(flightId: string): Promise<string[]>;
}
