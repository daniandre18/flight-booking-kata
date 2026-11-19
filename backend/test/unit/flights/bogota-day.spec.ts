import { bogotaDayRange, isOnBogotaDate } from '../../../src/flights/domain/bogota-day';

describe('Día en America/Bogota', () => {
  it('el día empieza a las 00:00 de Bogotá (05:00 UTC) y dura 24 h', () => {
    expect(bogotaDayRange('2026-11-19')).toEqual({
      start: new Date('2026-11-19T05:00:00.000Z'),
      end: new Date('2026-11-20T05:00:00.000Z'),
    });
  });

  it('cruza meses y años sin errores', () => {
    expect(bogotaDayRange('2026-12-31').end).toEqual(new Date('2027-01-01T05:00:00.000Z'));
  });

  it('isOnBogotaDate usa la fecha local de Bogotá, no la de UTC', () => {
    // 2026-11-20 02:00 UTC = 2026-11-19 21:00 en Bogotá.
    expect(isOnBogotaDate(new Date('2026-11-20T02:00:00.000Z'), '2026-11-19')).toBe(true);
    expect(isOnBogotaDate(new Date('2026-11-20T05:00:00.000Z'), '2026-11-19')).toBe(false);
  });

  it('los extremos del rango coinciden con isOnBogotaDate', () => {
    const { start, end } = bogotaDayRange('2026-11-19');
    expect(isOnBogotaDate(start, '2026-11-19')).toBe(true);
    expect(isOnBogotaDate(new Date(end.getTime() - 1), '2026-11-19')).toBe(true);
    expect(isOnBogotaDate(end, '2026-11-19')).toBe(false);
  });
});
