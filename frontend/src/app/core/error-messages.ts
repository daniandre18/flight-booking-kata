import type { ErrorCode } from '@kata/shared';

/** Error del navegador sin respuesta del servidor (no es un código del contrato). */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR';

/**
 * Único mapa `code` → mensaje (principio III, DRY; RUX-035 y RUX-036): español claro, sin jerga,
 * que dice qué pasó y qué puede hacer la persona. Ninguna otra parte de la app traduce códigos.
 */
export const ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  BAD_REQUEST: 'No pudimos procesar la solicitud. Recarga la página e intenta de nuevo.',
  CLIENT_ID_REQUIRED: 'No pudimos identificar tu navegador. Recarga la página e intenta de nuevo.',
  IDEMPOTENCY_KEY_REQUIRED: 'No pudimos procesar el pago. Vuelve a intentarlo.',
  ADMIN_UNAUTHORIZED: 'La clave de administrador no es correcta. Revísala e intenta de nuevo.',
  PAYMENT_DECLINED:
    'El pago fue rechazado. Tus asientos siguen bloqueados: prueba con otra tarjeta.',
  FLIGHT_NOT_FOUND: 'No encontramos ese vuelo. Vuelve a la búsqueda y elige otro.',
  SEAT_NOT_FOUND: 'Ese asiento no existe en este avión. Elige otro del mapa.',
  BOOKING_NOT_FOUND:
    'No encontramos una reserva con ese código y correo. Revisa los datos e intenta de nuevo.',
  ROUTE_NOT_FOUND: 'Esa página no existe. Vuelve al inicio.',
  SEAT_UNAVAILABLE: 'Este asiento ya no está disponible. Elige otro asiento del mapa.',
  SEAT_NOT_HELD: 'Ese asiento ya no está bloqueado a tu nombre. Revisa el mapa actualizado.',
  HOLD_EXPIRED:
    'Tu tiempo para pagar terminó y los asientos se liberaron. Vuelve al mapa y elígelos de nuevo.',
  VALIDATION_ERROR: 'Hay datos por corregir. Revisa los campos marcados.',
  HOLD_LIMIT_REACHED:
    'Ya tienes 4 asientos bloqueados en este vuelo. Libera uno o continúa al pago.',
  PASSENGERS_MISMATCH:
    'Los pasajeros no coinciden con tus asientos bloqueados. Vuelve al mapa para revisarlos.',
  INVALID_DELAY: 'La nueva hora debe ser posterior a la salida actual. Elige una hora más tarde.',
  IDEMPOTENCY_KEY_REUSED:
    'Este pago ya se envió con otros datos. Recarga la página para empezar de nuevo.',
  FLIGHT_NOT_BOOKABLE:
    'Este vuelo ya no admite reservas (cancelado, agotado o ya salió). Busca otro vuelo.',
  FLIGHT_STATUS_CONFLICT: 'El vuelo está cancelado y ya no admite cambios.',
  TOO_MANY_REQUESTS: 'Demasiados intentos, espera un momento.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Intenta de nuevo en unos segundos.',
  SERVICE_UNAVAILABLE: 'El servicio no está disponible ahora. Intenta de nuevo en unos segundos.',
  NETWORK_ERROR: 'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.',
};

export function messageFor(code: ClientErrorCode): string {
  return ERROR_MESSAGES[code];
}
