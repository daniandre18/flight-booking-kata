import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterPublisher } from '../../../src/realtime/infrastructure/event-emitter.publisher';
import {
  type DomainEvent,
  domainEventName,
} from '../../../src/shared-kernel/application/event-publisher';
import { SystemClock } from '../../../src/shared-kernel/infrastructure/system-clock';
import { clockContract } from '../../contracts/clock.contract';
import { eventPublisherContract } from '../../contracts/event-publisher.contract';
import { RecordingEventPublisher } from '../../doubles/shared-kernel.doubles';
import { FakeClock } from '../../support/fake-clock';

clockContract('SystemClock', () => new SystemClock());
clockContract('FakeClock', () => new FakeClock());

eventPublisherContract('EventEmitterPublisher', () => {
  const emitter = new EventEmitter2();
  const received: DomainEvent[] = [];
  const types: DomainEvent['type'][] = [
    'SeatHeld',
    'SeatReleased',
    'SeatBooked',
    'FlightUpdated',
    'FlightStatsChanged',
  ];
  types.forEach((type) =>
    emitter.on(domainEventName(type), (event: DomainEvent) => received.push(event)),
  );
  return { publisher: new EventEmitterPublisher(emitter), received: () => received };
});

eventPublisherContract('RecordingEventPublisher', () => {
  const publisher = new RecordingEventPublisher();
  return { publisher, received: () => publisher.published };
});
