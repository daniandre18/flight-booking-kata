import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DomainError } from '../../domain/domain-error';

export const CLIENT_ID_HEADER = 'x-client-id';

const ClientIdSchema = z.uuid();

/** Identidad anónima del cliente: UUID del header `X-Client-Id` (400 CLIENT_ID_REQUIRED si falta). */
export function parseClientId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value !== undefined && ClientIdSchema.safeParse(value).success) {
    return value.toLowerCase();
  }
  throw new DomainError('CLIENT_ID_REQUIRED', 'Falta el header X-Client-Id con un UUID válido');
}

export const ClientId = createParamDecorator((_data: unknown, context: ExecutionContext): string =>
  parseClientId(context.switchToHttp().getRequest<Request>().headers[CLIENT_ID_HEADER]),
);
