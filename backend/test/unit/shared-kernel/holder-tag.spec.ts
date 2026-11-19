import { holderTagOf } from '../../../src/shared-kernel/domain/holder-tag';

const CLIENT_A = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';
const CLIENT_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('holderTagOf', () => {
  it('devuelve 16 caracteres hexadecimales', () => {
    expect(holderTagOf(CLIENT_A)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('es determinista e independiente de mayúsculas', () => {
    expect(holderTagOf(CLIENT_A)).toBe(holderTagOf(CLIENT_A.toUpperCase()));
  });

  it('distingue clientes y no contiene el clientId', () => {
    expect(holderTagOf(CLIENT_A)).not.toBe(holderTagOf(CLIENT_B));
    expect(CLIENT_A.replaceAll('-', '')).not.toContain(holderTagOf(CLIENT_A));
  });
});
