import { detectCardBrand, lastFourDigits } from '../src/index';

describe('detectCardBrand', () => {
  it.each([
    ['4111111111111111', 'VISA'],
    ['4000000000000002', 'VISA'],
    ['5105105105105100', 'MASTERCARD'],
    ['2221000000000009', 'MASTERCARD'],
    ['2720999999999996', 'MASTERCARD'],
    ['6011111111111117', 'DISCOVER'],
    ['6500000000000002', 'DISCOVER'],
    ['6445644564456445', 'DISCOVER'],
    ['3530111333300000', 'OTHER'],
    ['2720999999999996'.replace('2720', '2721'), 'OTHER'],
  ])('%s → %s', (number, brand) => {
    expect(detectCardBrand(number)).toBe(brand);
  });

  it('ignora separadores', () => {
    expect(detectCardBrand('4111 1111-1111 1111')).toBe('VISA');
  });
});

describe('lastFourDigits', () => {
  it('devuelve solo los últimos 4 dígitos', () => {
    expect(lastFourDigits('4111 1111 1111 1234')).toBe('1234');
  });
});
