import { createHash } from 'node:crypto';

const HOLDER_TAG_LENGTH = 16;

/**
 * Tag público del dueño de un bloqueo: primeros 16 hex de SHA-256(clientId) (research.md §15).
 * Es el único sitio que lo calcula; el `clientId` nunca se difunde ni se registra.
 */
export function holderTagOf(clientId: string): string {
  return createHash('sha256')
    .update(clientId.toLowerCase())
    .digest('hex')
    .slice(0, HOLDER_TAG_LENGTH);
}
