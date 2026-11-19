import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import {
  DOMAIN_EVENTS,
  RealtimeGateway,
} from '../../../src/realtime/infrastructure/realtime.gateway';

/**
 * Regresión: `@OnEvent([...])` registraba un único nombre ("a,b,c") y el gateway no difundía nada.
 * Cada evento de dominio debe tener su propio listener con un nombre simple.
 */
describe('RealtimeGateway: listeners de eventos de dominio', () => {
  it('registra un listener por cada evento de dominio', () => {
    const metadata = Reflect.getMetadata(
      EVENT_LISTENER_METADATA,
      RealtimeGateway.prototype.broadcast,
    ) as { event: unknown }[];
    const events = metadata.map((entry) => entry.event);
    expect(events.every((event) => typeof event === 'string')).toBe(true);
    expect([...events].sort()).toEqual([...DOMAIN_EVENTS].sort());
    expect(DOMAIN_EVENTS).toHaveLength(5);
  });
});
