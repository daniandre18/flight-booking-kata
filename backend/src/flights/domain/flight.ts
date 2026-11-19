/** Reglas puras del vuelo. La fase 7 añade transiciones y `isBookable`. */

export function durationMinutes(departureAt: Date, arrivalAt: Date): number {
  return Math.round((arrivalAt.getTime() - departureAt.getTime()) / 60_000);
}

/** Un vuelo está retrasado si su salida vigente es posterior a la programada (research.md §14). */
export function isDelayed(scheduledDepartureAt: Date, departureAt: Date): boolean {
  return departureAt.getTime() > scheduledDepartureAt.getTime();
}
