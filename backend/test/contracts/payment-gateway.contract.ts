import { DECLINED_TEST_CARD } from '@kata/shared';
import type {
  ChargeRequest,
  PaymentGateway,
} from '../../src/bookings/application/ports/payment-gateway.port';

const VISA = '4111111111111111';
const MASTERCARD = '5555555555554444';

function request(number: string): ChargeRequest {
  return { amount: 420_000, card: { number, expiry: '12/30', cvv: '123' } };
}

function deepFreeze<T extends object>(value: T): T {
  for (const nested of Object.values(value)) {
    if (typeof nested === 'object' && nested !== null) {
      deepFreeze(nested as object);
    }
  }
  return Object.freeze(value);
}

/** Contrato del puerto PaymentGateway: toda implementación debe pasarlo (L de SOLID). */
export function paymentGatewayContract(name: string, create: () => PaymentGateway): void {
  describe(`contrato PaymentGateway: ${name}`, () => {
    it.each([
      [VISA, 'VISA', '1111'],
      [MASTERCARD, 'MASTERCARD', '4444'],
    ])('aprueba %s devolviendo marca %s y últimos 4 %s', async (number, brand, last4) => {
      await expect(create().charge(request(number))).resolves.toEqual({
        approved: true,
        cardBrand: brand,
        cardLast4: last4,
      });
    });

    it('rechaza la tarjeta de prueba con un resultado, sin lanzar excepción', async () => {
      const result = await create().charge(request(DECLINED_TEST_CARD));
      expect(result.approved).toBe(false);
    });

    it('no muta la solicitud', async () => {
      const frozen = deepFreeze(request(VISA));
      const copy = structuredClone(frozen);
      await create().charge(frozen);
      expect(frozen).toEqual(copy);
    });

    it('no conserva el número ni el CVV de la tarjeta', async () => {
      const gateway = create();
      const result = await gateway.charge(request(VISA));
      const kept = JSON.stringify({ gateway, result });
      expect(kept).not.toContain(VISA);
      expect(kept).not.toContain('"123"');
    });
  });
}
