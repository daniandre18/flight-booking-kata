/** Fechas en la hora local de Colombia (research.md §18). Colombia no usa horario de verano. */

export const BOGOTA_TIME_ZONE = 'America/Bogota';

const BOGOTA_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BOGOTA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha `YYYY-MM-DD` del instante dado en Bogotá. */
export function toBogotaDate(instant: Date): string {
  return BOGOTA_DATE_FORMAT.format(instant);
}

/** `true` si `value` es una fecha de calendario válida en formato `YYYY-MM-DD`. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
