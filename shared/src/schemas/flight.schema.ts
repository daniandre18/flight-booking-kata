import { z } from 'zod';
import { AIRPORT_CODES, FlightEventType, FlightStatus, ReleaseReason } from '../enums/index.js';
import { isValidIsoDate, toBogotaDate } from '../domain/bogota-date.js';
import { SeatCodeSchema } from '../domain/seat-code.js';

export const AirportCodeSchema = z.enum(AIRPORT_CODES);
export const FlightStatusSchema = z.enum(FlightStatus);
export const ReleaseReasonSchema = z.enum(ReleaseReason);
export const FlightEventTypeSchema = z.enum(FlightEventType);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: 'La fecha debe tener el formato AAAA-MM-DD' });

/**
 * Búsqueda por ruta y fecha. La fecha no puede ser anterior a hoy en Bogotá y el origen debe
 * ser distinto del destino (RF-003). `now` se inyecta para respetar el reloj del backend.
 */
export function createSearchFlightsQuerySchema(now: () => Date = () => new Date()) {
  return z
    .object({
      origin: AirportCodeSchema,
      destination: AirportCodeSchema,
      date: IsoDateSchema,
    })
    .superRefine((query, ctx) => {
      if (query.origin === query.destination) {
        ctx.addIssue({
          code: 'custom',
          path: ['destination'],
          message: 'El destino debe ser distinto del origen',
        });
      }
      if (query.date < toBogotaDate(now())) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'La fecha no puede ser pasada' });
      }
    });
}

export const SearchFlightsQuerySchema = createSearchFlightsQuerySchema();
export type SearchFlightsQuery = z.infer<typeof SearchFlightsQuerySchema>;

export const FlightDtoSchema = z.object({
  id: z.uuid(),
  seq: z.int().nonnegative(),
  flightNumber: z.string(),
  origin: AirportCodeSchema,
  destination: AirportCodeSchema,
  scheduledDepartureAt: IsoDateTimeSchema,
  departureAt: IsoDateTimeSchema,
  arrivalAt: IsoDateTimeSchema,
  durationMinutes: z.int().positive(),
  fare: z.int().positive(),
  status: FlightStatusSchema,
  delayed: z.boolean(),
  availableSeats: z.int().nonnegative(),
  capacity: z.int().positive(),
});
export type FlightDto = z.infer<typeof FlightDtoSchema>;

export const SeatCountsSchema = z.object({
  available: z.int().nonnegative(),
  held: z.int().nonnegative(),
  booked: z.int().nonnegative(),
  total: z.int().nonnegative(),
});
export type SeatCounts = z.infer<typeof SeatCountsSchema>;

export const FlightStatsDtoSchema = SeatCountsSchema.extend({
  flightId: z.uuid(),
  occupancyPercent: z.number().min(0).max(100),
  seq: z.int().nonnegative(),
});
export type FlightStatsDto = z.infer<typeof FlightStatsDtoSchema>;

export const ActivityEntryDtoSchema = z.object({
  seq: z.int().nonnegative(),
  type: FlightEventTypeSchema,
  seatId: SeatCodeSchema.nullable(),
  status: z.string(),
  reason: ReleaseReasonSchema.optional(),
  occurredAt: IsoDateTimeSchema,
});
export type ActivityEntryDto = z.infer<typeof ActivityEntryDtoSchema>;

export const UpdateFlightStatusRequestSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal(FlightStatus.DELAYED), newDepartureAt: IsoDateTimeSchema }),
  z.object({ status: z.literal(FlightStatus.CANCELLED) }),
]);
export type UpdateFlightStatusRequest = z.infer<typeof UpdateFlightStatusRequestSchema>;

/** `GET /flights/:id/events?limit=`: registro de actividad (por defecto 50, máximo 100). */
export const FlightEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type FlightEventsQuery = z.infer<typeof FlightEventsQuerySchema>;
