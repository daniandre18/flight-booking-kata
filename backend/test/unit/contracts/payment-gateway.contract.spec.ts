import { FakePaymentGateway } from '../../../src/bookings/infrastructure/fake-payment.gateway';
import { paymentGatewayContract } from '../../contracts/payment-gateway.contract';
import { ScriptedPaymentGateway } from '../../doubles/bookings.doubles';

paymentGatewayContract('FakePaymentGateway', () => new FakePaymentGateway());
paymentGatewayContract('ScriptedPaymentGateway', () => new ScriptedPaymentGateway());
