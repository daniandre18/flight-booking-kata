import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import { APP_CONFIG, type AppConfig } from '../../shared-kernel/infrastructure/config';

export const ADMIN_KEY_HEADER = 'x-admin-key';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Protege las acciones de administración con `X-Admin-Key` (Clarifications). Compara en tiempo
 * constante sobre los SHA-256 de ambos valores, que siempre tienen la misma longitud (principio X).
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.expected = digest(config.adminKey);
  }

  canActivate(context: ExecutionContext): boolean {
    const provided = context.switchToHttp().getRequest<Request>().headers[ADMIN_KEY_HEADER];
    if (typeof provided === 'string' && timingSafeEqual(digest(provided), this.expected)) {
      return true;
    }
    throw new DomainError('ADMIN_UNAUTHORIZED', 'La clave de administrador es incorrecta');
  }
}
