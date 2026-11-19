import type { FlightDto } from '@kata/shared';
import { durationMinutes, isDelayed } from '../domain/flight';
import type { FlightView } from './ports/flight-query.port';

/** Única traducción FlightView → FlightDto (DRY): la usan flights y seats. */
export function toFlightDto(view: FlightView): FlightDto {
  return {
    id: view.id,
    seq: view.seq,
    flightNumber: view.flightNumber,
    origin: view.origin,
    destination: view.destination,
    scheduledDepartureAt: view.scheduledDepartureAt.toISOString(),
    departureAt: view.departureAt.toISOString(),
    arrivalAt: view.arrivalAt.toISOString(),
    durationMinutes: durationMinutes(view.departureAt, view.arrivalAt),
    fare: view.fare,
    status: view.status,
    delayed: isDelayed(view.scheduledDepartureAt, view.departureAt),
    availableSeats: view.availableSeats,
    capacity: view.capacity,
  };
}
