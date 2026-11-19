import type { SeatLetter, SeatStatus } from '@kata/shared';

/** Lectura de asientos (I de SOLID: separada de la escritura). Vista perezosa de vencimientos. */
export const SEAT_QUERY_PORT = Symbol('SeatQueryPort');

export interface SeatView {
  row: number;
  letter: SeatLetter;
  status: SeatStatus;
  holderTag: string | null;
  holdExpiresAt: Date | null;
}

export interface ClientHoldGroup {
  flightId: string;
  seatCodes: string[];
  holdExpiresAt: Date;
}

export interface SeatQueryPort {
  getSeats(flightId: string, now: Date): Promise<SeatView[]>;
  getClientHolds(clientId: string, now: Date): Promise<ClientHoldGroup[]>;
}
