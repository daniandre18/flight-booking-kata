import type { SeatLetter, SeatType } from '@kata/shared';

/** Las cinco situaciones que distingue el mapa (RUX-005). */
export type SeatDisplay = 'available' | 'mine' | 'other' | 'booked' | 'unavailable';

export interface SeatCell {
  seatId: string;
  row: number;
  letter: SeatLetter;
  type: SeatType;
  price: number;
  display: SeatDisplay;
}

export const SEAT_DISPLAY_LABEL: Record<SeatDisplay, string> = {
  available: 'disponible',
  mine: 'seleccionado por ti',
  other: 'bloqueado por otra persona',
  booked: 'reservado',
  unavailable: 'no disponible',
};
