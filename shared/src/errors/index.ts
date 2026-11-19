import { z } from 'zod';

/**
 * Código de error → estado HTTP (research.md §17, constitución principio VI).
 * 409 solo para conflictos de asiento; las reglas de negocio responden 422.
 */
export const ERROR_HTTP_STATUS = {
  BAD_REQUEST: 400,
  CLIENT_ID_REQUIRED: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  ADMIN_UNAUTHORIZED: 401,
  PAYMENT_DECLINED: 402,
  FLIGHT_NOT_FOUND: 404,
  SEAT_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  SEAT_UNAVAILABLE: 409,
  SEAT_NOT_HELD: 409,
  HOLD_EXPIRED: 410,
  VALIDATION_ERROR: 422,
  HOLD_LIMIT_REACHED: 422,
  PASSENGERS_MISMATCH: 422,
  INVALID_DELAY: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
  FLIGHT_NOT_BOOKABLE: 422,
  FLIGHT_STATUS_CONFLICT: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;

export const ERROR_CODES = Object.keys(ERROR_HTTP_STATUS) as [ErrorCode, ...ErrorCode[]];

export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const ValidationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/** Formato único de error de la API: `{ code, message, details }`. */
export const ErrorResponseSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.union([z.null(), z.array(ValidationIssueSchema), z.record(z.string(), z.unknown())]),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function httpStatusOf(code: ErrorCode): number {
  return ERROR_HTTP_STATUS[code];
}
