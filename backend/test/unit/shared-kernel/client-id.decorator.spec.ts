import { DomainError } from '../../../src/shared-kernel/domain/domain-error';
import { parseClientId } from '../../../src/shared-kernel/infrastructure/http/client-id.decorator';

const V4 = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';

describe('parseClientId (X-Client-Id)', () => {
  it('acepta un UUID v4 y lo normaliza a minúsculas', () => {
    expect(parseClientId(V4.toUpperCase())).toBe(V4);
  });

  it.each([
    ['ausente', undefined],
    ['UUID v1', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
    ['UUID v5', 'a43ba235-6321-5a88-b282-0af2d4095301'],
    ['texto', 'cliente-1'],
    ['header repetido', [V4, V4]],
  ])('rechaza %s con 400 CLIENT_ID_REQUIRED', (_case, raw) => {
    expect(() => parseClientId(raw)).toThrow(DomainError);
    try {
      parseClientId(raw);
    } catch (error) {
      expect((error as DomainError).code).toBe('CLIENT_ID_REQUIRED');
    }
  });
});
