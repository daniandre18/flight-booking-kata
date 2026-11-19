import { z } from 'zod';
import { SeatType } from '../enums/index.js';

/** Utilidades del código de asiento (`12C` = fila + letra). data-model.md `seats.row`, `seats.letter`. */

export const SEAT_ROWS = 30;
export const SEAT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type SeatLetter = (typeof SEAT_LETTERS)[number];

export const SEAT_CODE_PATTERN = /^([1-9]|[12][0-9]|30)[A-F]$/;

export const SeatCodeSchema = z.string().regex(SEAT_CODE_PATTERN, 'Código de asiento inválido');

export interface SeatPosition {
  row: number;
  letter: SeatLetter;
}

export function formatSeatCode(row: number, letter: SeatLetter): string {
  return `${row}${letter}`;
}

export function parseSeatCode(code: string): SeatPosition | null {
  if (!SEAT_CODE_PATTERN.test(code)) {
    return null;
  }
  return { row: Number(code.slice(0, -1)), letter: code.slice(-1) as SeatLetter };
}

/** Ventana (A, F), medio (B, E) y pasillo (C, D). */
export function seatTypeOf(letter: SeatLetter): SeatType {
  switch (letter) {
    case 'A':
    case 'F':
      return SeatType.WINDOW;
    case 'B':
    case 'E':
      return SeatType.MIDDLE;
    case 'C':
    case 'D':
      return SeatType.AISLE;
  }
}

/** Todas las posiciones de un avión de 30 × 6, en orden de fila y letra. */
export function allSeatPositions(): SeatPosition[] {
  const positions: SeatPosition[] = [];
  for (let row = 1; row <= SEAT_ROWS; row += 1) {
    for (const letter of SEAT_LETTERS) {
      positions.push({ row, letter });
    }
  }
  return positions;
}
