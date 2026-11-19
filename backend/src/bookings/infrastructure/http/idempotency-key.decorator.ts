import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { IdempotencyKeySchema } from '@kata/shared';
import type { Request } from 'express';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** `Idempotency-Key` obligatorio (UUID, `IdempotencyKeySchema`); si no → 400. */
export function parseIdempotencyKey(raw: string | string[] | undefined): string {
  const parsed = typeof raw === 'string' ? IdempotencyKeySchema.safeParse(raw) : null;
  if (parsed?.success) {
    return parsed.data.toLowerCase();
  }
  throw new DomainError(
    'IDEMPOTENCY_KEY_REQUIRED',
    'Falta el header Idempotency-Key con un UUID válido',
  );
}

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    parseIdempotencyKey(
      context.switchToHttp().getRequest<Request>().headers[IDEMPOTENCY_KEY_HEADER],
    ),
);
