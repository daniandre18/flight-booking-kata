/**
 * Enums de dominio compartidos por backend y frontend (data-model.md § Enums).
 * Se definen como objetos `as const` para usarlos como valores y como tipos.
 */

export const SeatStatus = {
  AVAILABLE: 'AVAILABLE',
  HELD: 'HELD',
  BOOKED: 'BOOKED',
} as const;
export type SeatStatus = (typeof SeatStatus)[keyof typeof SeatStatus];

export const FlightStatus = {
  SCHEDULED: 'SCHEDULED',
  DELAYED: 'DELAYED',
  CANCELLED: 'CANCELLED',
  SOLD_OUT: 'SOLD_OUT',
} as const;
export type FlightStatus = (typeof FlightStatus)[keyof typeof FlightStatus];

export const SeatType = {
  WINDOW: 'WINDOW',
  MIDDLE: 'MIDDLE',
  AISLE: 'AISLE',
} as const;
export type SeatType = (typeof SeatType)[keyof typeof SeatType];

export const ReleaseReason = {
  MANUAL: 'MANUAL',
  EXPIRED: 'EXPIRED',
  FLIGHT_CANCELLED: 'FLIGHT_CANCELLED',
} as const;
export type ReleaseReason = (typeof ReleaseReason)[keyof typeof ReleaseReason];

export const FlightEventType = {
  SEAT_HELD: 'SEAT_HELD',
  SEAT_RELEASED: 'SEAT_RELEASED',
  SEAT_BOOKED: 'SEAT_BOOKED',
  FLIGHT_UPDATED: 'FLIGHT_UPDATED',
} as const;
export type FlightEventType = (typeof FlightEventType)[keyof typeof FlightEventType];

/** Cambio de estado del vuelo que se anuncia en `flight:updated` y `flight:stats`. */
export const FlightChange = {
  DELAYED: 'DELAYED',
  CANCELLED: 'CANCELLED',
  SOLD_OUT: 'SOLD_OUT',
} as const;
export type FlightChange = (typeof FlightChange)[keyof typeof FlightChange];

export const AIRPORT_CODES = ['BOG', 'MDE', 'CLO', 'CTG', 'BAQ'] as const;
export type AirportCode = (typeof AIRPORT_CODES)[number];
