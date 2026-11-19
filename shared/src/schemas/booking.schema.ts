import { z } from 'zod';
import { CardBrand } from '../enums/index.js';
import { SeatCodeSchema } from '../domain/seat-code.js';
import { FlightDtoSchema, IsoDateTimeSchema } from './flight.schema.js';
import { SeatTypeSchema } from './seat.schema.js';

/** Tarjeta ficticia que el pago simulado siempre rechaza (data-model.md). */
export const DECLINED_TEST_CARD = '4000000000000002';

export const MAX_PASSENGERS_PER_BOOKING = 4;

const PersonNameSchema = z.string().trim().min(2).max(100);

/** `true` si la tarjeta `MM/YY` vence en el mes actual o después. */
export function isCardExpiryInFuture(expiry: string, now: Date): boolean {
  const [month, year] = expiry.split('/').map(Number);
  if (month === undefined || year === undefined) {
    return false;
  }
  const endOfExpiryMonth = Date.UTC(2000 + year, month, 1);
  return endOfExpiryMonth > now.getTime();
}

function createCardSchema(now: () => Date) {
  return z
    .object({
      number: z.string().regex(/^\d{16}$/, 'El número de tarjeta debe tener 16 dígitos'),
      expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'El vencimiento debe ser MM/AA'),
      cvv: z.string().regex(/^\d{3}$/, 'El código de seguridad debe tener 3 dígitos'),
    })
    .superRefine((card, ctx) => {
      if (
        /^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry) &&
        !isCardExpiryInFuture(card.expiry, now())
      ) {
        ctx.addIssue({ code: 'custom', path: ['expiry'], message: 'La tarjeta está vencida' });
      }
    });
}

/** Confirmación de todos los bloqueos vigentes del cliente en el vuelo (RF-016). */
export function createCreateBookingRequestSchema(now: () => Date = () => new Date()) {
  return z.object({
    flightId: z.uuid(),
    buyer: z.object({ name: PersonNameSchema, email: z.email() }),
    passengers: z
      .array(z.object({ seatId: SeatCodeSchema, name: PersonNameSchema }))
      .min(1)
      .max(MAX_PASSENGERS_PER_BOOKING)
      .superRefine((passengers, ctx) => {
        const seen = new Set<string>();
        passengers.forEach((passenger, index) => {
          if (seen.has(passenger.seatId)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'seatId'],
              message: 'Cada asiento debe aparecer una sola vez',
            });
          }
          seen.add(passenger.seatId);
        });
      }),
    card: createCardSchema(now),
  });
}

export const CreateBookingRequestSchema = createCreateBookingRequestSchema();
export type CreateBookingRequest = z.infer<typeof CreateBookingRequestSchema>;

export const BookingLookupRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{6}$/, 'El código de reserva tiene 6 caracteres')
    .transform((code) => code.toUpperCase()),
  email: z
    .string()
    .trim()
    .pipe(z.email())
    .transform((email) => email.toLowerCase()),
});
export type BookingLookupRequest = z.infer<typeof BookingLookupRequestSchema>;

export const BookingDtoSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  flight: FlightDtoSchema,
  buyer: z.object({ name: z.string(), email: z.email() }),
  passengers: z.array(z.object({ seatId: SeatCodeSchema, name: z.string(), type: SeatTypeSchema })),
  total: z.int().positive(),
  cardBrand: z.enum(CardBrand),
  cardLast4: z.string().regex(/^\d{4}$/),
  createdAt: IsoDateTimeSchema,
});
export type BookingDto = z.infer<typeof BookingDtoSchema>;
