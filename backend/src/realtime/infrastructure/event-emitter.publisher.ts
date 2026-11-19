import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type DomainEvent,
  type EventPublisher,
  domainEventName,
} from '../../shared-kernel/application/event-publisher';

/**
 * Publica eventos de dominio en el bus interno (EventEmitter2). Los casos de uso lo llaman solo
 * después del commit; el RealtimeGateway (fase 6) escucha `domain.*` y emite por Socket.io.
 */
@Injectable()
export class EventEmitterPublisher implements EventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.emitter.emit(domainEventName(event.type), event);
    }
  }
}
