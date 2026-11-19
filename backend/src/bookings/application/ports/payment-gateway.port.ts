import type { CardBrand } from '@kata/shared';

/**
 * Pasarela de pago (O de SOLID: un proveedor real sería otro adaptador). La tarjeta solo vive en
 * memoria durante el cobro; la pasarela devuelve lo único que se guarda: marca y últimos 4.
 */
export const PAYMENT_GATEWAY = Symbol('PaymentGateway');

export interface PaymentCard {
  number: string;
  expiry: string;
  cvv: string;
}

export interface ChargeRequest {
  /** Monto en pesos colombianos (entero). */
  amount: number;
  card: Readonly<PaymentCard>;
}

export type ChargeResult =
  { approved: true; cardBrand: CardBrand; cardLast4: string } | { approved: false; reason: string };

export interface PaymentGateway {
  /** Un rechazo es un resultado, no una excepción. */
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
