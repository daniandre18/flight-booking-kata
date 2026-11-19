import {
  MAX_HOLDS_PER_FLIGHT,
  assertCanHoldMore,
  computeHoldExpiry,
  isHoldExpired,
} from '../../../src/seats/domain/hold-policy';
import { DomainError } from '../../../src/shared-kernel/domain/domain-error';

const NOW = new Date('2026-11-18T15:00:00.000Z');
const TTL = 600;

describe('política de bloqueo', () => {
  it('sin bloqueos vigentes, vence en now + ttl', () => {
    expect(computeHoldExpiry(null, NOW, TTL)).toEqual(new Date('2026-11-18T15:10:00.000Z'));
  });

  it('con bloqueos vigentes, hereda su vencimiento (reloj compartido, no se extiende)', () => {
    const shared = new Date('2026-11-18T15:04:00.000Z');
    expect(computeHoldExpiry(shared, NOW, TTL)).toBe(shared);
  });

  it('un vencimiento ya pasado no se hereda: empieza un reloj nuevo', () => {
    const expired = new Date('2026-11-18T14:59:59.000Z');
    expect(computeHoldExpiry(expired, NOW, TTL)).toEqual(new Date('2026-11-18T15:10:00.000Z'));
  });

  it('considera vencido un bloqueo justo en su hora de vencimiento', () => {
    expect(isHoldExpired(NOW, NOW)).toBe(true);
    expect(isHoldExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });

  it(`permite hasta ${MAX_HOLDS_PER_FLIGHT} bloqueos por cliente y vuelo`, () => {
    expect(() => assertCanHoldMore(MAX_HOLDS_PER_FLIGHT - 1)).not.toThrow();
    expect(() => assertCanHoldMore(MAX_HOLDS_PER_FLIGHT)).toThrow(DomainError);
    try {
      assertCanHoldMore(MAX_HOLDS_PER_FLIGHT);
    } catch (error) {
      expect((error as DomainError).code).toBe('HOLD_LIMIT_REACHED');
    }
  });
});
