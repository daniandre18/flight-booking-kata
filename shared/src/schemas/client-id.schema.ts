import { z } from 'zod';

/**
 * Identidad anónima del cliente: UUID v4 generado por el navegador. Lo validan el header
 * `X-Client-Id`, el handshake del socket y el frontend (constitución, principio X).
 */
export const ClientIdSchema = z.uuidv4();
export type ClientId = z.infer<typeof ClientIdSchema>;
