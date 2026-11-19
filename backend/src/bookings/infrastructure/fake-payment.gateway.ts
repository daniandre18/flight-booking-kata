import { Injectable } from '@nestjs/common';
import { DECLINED_TEST_CARD, detectCardBrand, lastFourDigits } from '@kata/shared';
import type {
  ChargeRequest,
  ChargeResult,
  PaymentGateway,
} from '../application/ports/payment-gateway.port';

/**
 * Pago ficticio e instantáneo (spec, Supuestos): rechaza la tarjeta de prueba
 * `4000000000000002` y aprueba el resto. No registra ni conserva la tarjeta.
 */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult> {
    const { number } = request.card;
    if (number === DECLINED_TEST_CARD) {
      return Promise.resolve({ approved: false, reason: 'CARD_DECLINED' });
    }
    return Promise.resolve({
      approved: true,
      cardBrand: detectCardBrand(number),
      cardLast4: lastFourDigits(number),
    });
  }
}
