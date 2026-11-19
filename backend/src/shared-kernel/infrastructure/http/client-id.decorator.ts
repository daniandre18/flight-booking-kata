import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ClientIdSchema } from '@kata/shared';
import type { Request } from 'express';
import { DomainError } from '../../domain/domain-error';

export const CLIENT_ID_HEADER = 'x-client-id';

/**
 * Identidad anónima del cliente: `X-Client-Id` con un UUID v4 (`ClientIdSchema`, principio X).
 * Ausente, repetido, de otra versión o mal formado → 400 CLIENT_ID_REQUIRED.
 */
export function parseClientId(raw: string | string[] | undefined): string {
  const parsed = typeof raw === 'string' ? ClientIdSchema.safeParse(raw) : null;
  if (parsed?.success) {
    return parsed.data.toLowerCase();
  }
  throw new DomainError('CLIENT_ID_REQUIRED', 'Falta el header X-Client-Id con un UUID v4 válido');
}

export const ClientId = createParamDecorator((_data: unknown, context: ExecutionContext): string =>
  parseClientId(context.switchToHttp().getRequest<Request>().headers[CLIENT_ID_HEADER]),
);
