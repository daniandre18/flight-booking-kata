import type { Clock } from '../../src/shared-kernel/domain/clock';

/** Contrato del puerto Clock: toda implementación debe pasarlo (L de SOLID). */
export function clockContract(name: string, createClock: () => Clock): void {
  describe(`contrato Clock: ${name}`, () => {
    it('devuelve instancias de Date válidas', () => {
      const now = createClock().now();
      expect(now).toBeInstanceOf(Date);
      expect(Number.isNaN(now.getTime())).toBe(false);
    });

    it('devuelve copias: modificar la fecha no altera el reloj', () => {
      const clock = createClock();
      const first = clock.now();
      first.setFullYear(1999);
      expect(clock.now().getFullYear()).not.toBe(1999);
    });

    it('nunca retrocede entre llamadas consecutivas', () => {
      const clock = createClock();
      const first = clock.now().getTime();
      expect(clock.now().getTime()).toBeGreaterThanOrEqual(first);
    });
  });
}
