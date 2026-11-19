import { z } from 'zod';
import { SeatStatus, SeatType } from '../enums/index.js';
import { SEAT_LETTERS, SeatCodeSchema } from '../domain/seat-code.js';
import { FlightDtoSchema, IsoDateTimeSchema } from './flight.schema.js';

export const SeatStatusSchema = z.enum(SeatStatus);
export const SeatTypeSchema = z.enum(SeatType);

/** Primeros 16 caracteres hexadecimales de SHA-256(clientId). Nunca se difunde el clientId. */
export const HolderTagSchema = z.string().regex(/^[0-9a-f]{16}$/);

export const SeatDtoSchema = z.object({
  seatId: SeatCodeSchema,
  row: z.int().min(1).max(30),
  letter: z.enum(SEAT_LETTERS),
  type: SeatTypeSchema,
  status: SeatStatusSchema,
  price: z.int().positive(),
  holderTag: HolderTagSchema.nullable(),
  holdExpiresAt: IsoDateTimeSchema.nullable(),
});
export type SeatDto = z.infer<typeof SeatDtoSchema>;

export const SeatMapSnapshotSchema = z.object({
  flight: FlightDtoSchema,
  seats: z.array(SeatDtoSchema),
  seq: z.int().nonnegative(),
  serverNow: IsoDateTimeSchema,
});
export type SeatMapSnapshot = z.infer<typeof SeatMapSnapshotSchema>;

export const HoldSeatResponseSchema = z.object({
  flightId: z.uuid(),
  seatId: SeatCodeSchema,
  holdExpiresAt: IsoDateTimeSchema,
  holderTag: HolderTagSchema,
  seq: z.int().nonnegative(),
  serverNow: IsoDateTimeSchema,
});
export type HoldSeatResponse = z.infer<typeof HoldSeatResponseSchema>;

export const MyHoldsResponseSchema = z.object({
  holderTag: HolderTagSchema,
  serverNow: IsoDateTimeSchema,
  holds: z.array(
    z.object({
      flightId: z.uuid(),
      seatIds: z.array(SeatCodeSchema).max(4),
      holdExpiresAt: IsoDateTimeSchema,
    }),
  ),
});
export type MyHoldsResponse = z.infer<typeof MyHoldsResponseSchema>;
