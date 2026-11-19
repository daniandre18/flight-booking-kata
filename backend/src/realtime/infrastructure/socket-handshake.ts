import { ClientIdSchema, FlightRoomPayloadSchema, type RejectedAck } from '@kata/shared';
import type { Socket } from 'socket.io';

export const CLIENT_ID_REQUIRED = 'CLIENT_ID_REQUIRED';

/**
 * Middleware del handshake (principio X): exige `auth.clientId` con un UUID v4. Si no es válido,
 * la conexión se rechaza con `connect_error` y el mensaje `CLIENT_ID_REQUIRED`.
 */
export function clientIdHandshake(socket: Socket, next: (error?: Error) => void): void {
  const auth: unknown = socket.handshake.auth;
  const parsed = ClientIdSchema.safeParse((auth as { clientId?: unknown } | null)?.clientId);
  if (!parsed.success) {
    next(new Error(CLIENT_ID_REQUIRED));
    return;
  }
  (socket.data as { clientId?: string }).clientId = parsed.data.toLowerCase();
  next();
}

export type RoomPayloadResult = { ok: true; flightId: string } | RejectedAck;

/** Valida el payload cliente → servidor con el esquema compartido. */
export function parseRoomPayload(payload: unknown): RoomPayloadResult {
  const parsed = FlightRoomPayloadSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, flightId: parsed.data.flightId }
    : { ok: false, code: 'VALIDATION_ERROR' };
}
