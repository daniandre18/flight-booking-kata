import { type ExecutionContext } from '@nestjs/common';
import { AdminKeyGuard } from '../../../src/admin/infrastructure/admin-key.guard';
import { DomainError } from '../../../src/shared-kernel/domain/domain-error';
import { type AppConfig } from '../../../src/shared-kernel/infrastructure/config';

function contextWith(headers: Record<string, string | string[]>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminKeyGuard', () => {
  const guard = new AdminKeyGuard({ adminKey: 'clave-correcta' } as AppConfig);

  it('deja pasar la clave correcta', () => {
    expect(guard.canActivate(contextWith({ 'x-admin-key': 'clave-correcta' }))).toBe(true);
  });

  it.each([
    ['incorrecta', { 'x-admin-key': 'clave-incorrect' }],
    ['de otra longitud', { 'x-admin-key': 'x' }],
    ['ausente', {}],
    ['repetida', { 'x-admin-key': ['clave-correcta', 'clave-correcta'] }],
  ])('rechaza una clave %s con 401 ADMIN_UNAUTHORIZED', (_case, headers) => {
    expect(() => guard.canActivate(contextWith(headers))).toThrow(DomainError);
    try {
      guard.canActivate(contextWith(headers));
    } catch (error) {
      expect((error as DomainError).code).toBe('ADMIN_UNAUTHORIZED');
    }
  });
});
