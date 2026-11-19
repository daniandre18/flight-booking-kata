import type { FlightStatus } from '@kata/shared';
import { DomainError } from '../../shared-kernel/domain/domain-error';

/**
 * Reglas puras del vuelo (data-model.md § Transiciones del vuelo). Sin infraestructura ni reloj:
 * el instante actual llega como parámetro.
 */
export interface FlightSchedule {
  status: FlightStatus;
  scheduledDepartureAt: Date;
  departureAt: Date;
  arrivalAt: Date;
}

export function durationMinutes(departureAt: Date, arrivalAt: Date): number {
  return Math.round((arrivalAt.getTime() - departureAt.getTime()) / 60_000);
}

/** Un vuelo está retrasado si su salida vigente es posterior a la programada (research.md §14). */
export function isDelayed(scheduledDepartureAt: Date, departureAt: Date): boolean {
  return departureAt.getTime() > scheduledDepartureAt.getTime();
}

/** Solo SCHEDULED o DELAYED que aún no salen admiten bloqueos y confirmaciones. */
export function isBookable(
  flight: Pick<FlightSchedule, 'status' | 'departureAt'>,
  now: Date,
): boolean {
  const open = flight.status === 'SCHEDULED' || flight.status === 'DELAYED';
  return open && flight.departureAt.getTime() > now.getTime();
}

function assertNotCancelled(flight: FlightSchedule): void {
  if (flight.status === 'CANCELLED') {
    throw new DomainError('FLIGHT_STATUS_CONFLICT', 'El vuelo ya está cancelado');
  }
}

/**
 * Retraso: la nueva salida debe ser posterior a la vigente y la llegada se desplaza lo mismo.
 * SOLD_OUT conserva su estado (el admin nunca pone ni quita AGOTADO); el resto pasa a DELAYED.
 */
export function delayFlight(flight: FlightSchedule, newDepartureAt: Date): FlightSchedule {
  assertNotCancelled(flight);
  const shiftMs = newDepartureAt.getTime() - flight.departureAt.getTime();
  if (shiftMs <= 0) {
    throw new DomainError(
      'INVALID_DELAY',
      'La nueva hora de salida debe ser posterior a la salida actual',
    );
  }
  return {
    status: flight.status === 'SOLD_OUT' ? 'SOLD_OUT' : 'DELAYED',
    scheduledDepartureAt: flight.scheduledDepartureAt,
    departureAt: newDepartureAt,
    arrivalAt: new Date(flight.arrivalAt.getTime() + shiftMs),
  };
}

/** Cancelación: estado terminal; las horas no cambian. */
export function cancelFlight(flight: FlightSchedule): FlightSchedule {
  assertNotCancelled(flight);
  return { ...flight, status: 'CANCELLED' };
}
