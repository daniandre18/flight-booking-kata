import { CardBrand } from '../enums/index.js';

const MASTERCARD_2_SERIES = { min: 2221, max: 2720 };
const DISCOVER_644_SERIES = { min: 644, max: 649 };

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

function isMastercard(digits: string): boolean {
  const twoDigits = Number(digits.slice(0, 2));
  return (
    (twoDigits >= 51 && twoDigits <= 55) || inRange(Number(digits.slice(0, 4)), MASTERCARD_2_SERIES)
  );
}

function isDiscover(digits: string): boolean {
  return (
    digits.startsWith('6011') ||
    digits.startsWith('65') ||
    inRange(Number(digits.slice(0, 3)), DISCOVER_644_SERIES)
  );
}

/** Marca de la tarjeta según su prefijo (data-model.md § Marca de la tarjeta). */
export function detectCardBrand(cardNumber: string): CardBrand {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.startsWith('4')) {
    return CardBrand.VISA;
  }
  if (isMastercard(digits)) {
    return CardBrand.MASTERCARD;
  }
  return isDiscover(digits) ? CardBrand.DISCOVER : CardBrand.OTHER;
}

/** Últimos 4 dígitos de la tarjeta: lo único que se muestra y se guarda del número. */
export function lastFourDigits(cardNumber: string): string {
  return cardNumber.replace(/\D/g, '').slice(-4);
}
