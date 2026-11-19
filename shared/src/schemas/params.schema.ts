import { z } from 'zod';
import { SeatCodeSchema } from '../domain/seat-code.js';

/** Parámetros de ruta compartidos (validación de toda entrada, principio X). */
export const FlightParamsSchema = z.object({ flightId: z.uuid() });
export type FlightParams = z.infer<typeof FlightParamsSchema>;

export const FlightSeatParamsSchema = FlightParamsSchema.extend({ seatId: SeatCodeSchema });
export type FlightSeatParams = z.infer<typeof FlightSeatParamsSchema>;

/** `GET /clients/me/holds?flightId=`: filtro opcional por vuelo. */
export const MyHoldsQuerySchema = z.object({ flightId: z.uuid().optional() });
export type MyHoldsQuery = z.infer<typeof MyHoldsQuerySchema>;
