import { toBogotaDate } from '@kata/shared';

/** Colombia está en UTC-5 todo el año (sin horario de verano, research.md §18). */
const BOGOTA_UTC_OFFSET = '-05:00';
const DAY_MS = 24 * 60 * 60 * 1_000;

export interface DayRange {
  /** Inclusivo: 00:00 del día en Bogotá. */
  start: Date;
  /** Exclusivo: 00:00 del día siguiente en Bogotá. */
  end: Date;
}

/** Rango `[start, end)` del día `YYYY-MM-DD` en hora de Bogotá. */
export function bogotaDayRange(date: string): DayRange {
  const start = new Date(`${date}T00:00:00.000${BOGOTA_UTC_OFFSET}`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** `true` si el instante cae en esa fecha de Bogotá (reutiliza `toBogotaDate` de shared: DRY). */
export function isOnBogotaDate(instant: Date, date: string): boolean {
  return toBogotaDate(instant) === date;
}
