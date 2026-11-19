import type {
  DomainEvent,
  EventPublisher,
} from '../../src/shared-kernel/application/event-publisher';

export interface PublisherUnderTest {
  publisher: EventPublisher;
  /** Eventos que recibió el destino del adaptador, en orden. */
  received(): DomainEvent[];
}

const occurredAt = new Date('2026-11-19T14:00:00.000Z');
const flightId = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';

export const SAMPLE_EVENTS: DomainEvent[] = [
  {
    type: 'SeatHeld',
    flightId,
    seq: 1,
    occurredAt,
    seatCode: '12C',
    holdExpiresAt: occurredAt,
    holderTag: '9f86d081884c7d65',
  },
  { type: 'SeatReleased', flightId, seq: 2, occurredAt, seatCode: '12C', reason: 'MANUAL' },
];

/** Contrato del puerto EventPublisher: toda implementación debe pasarlo (L de SOLID). */
export function eventPublisherContract(name: string, create: () => PublisherUnderTest): void {
  describe(`contrato EventPublisher: ${name}`, () => {
    it('entrega los eventos en el orden publicado y sin modificarlos', () => {
      const { publisher, received } = create();
      publisher.publish(SAMPLE_EVENTS);
      expect(received()).toEqual(SAMPLE_EVENTS);
    });

    it('no emite nada si la lista está vacía', () => {
      const { publisher, received } = create();
      publisher.publish([]);
      expect(received()).toEqual([]);
    });
  });
}
