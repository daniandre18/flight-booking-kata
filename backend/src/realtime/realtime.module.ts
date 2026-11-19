import { Global, Module } from '@nestjs/common';
import { FlightsModule } from '../flights';
import { EVENT_PUBLISHER } from '../shared-kernel/application/event-publisher';
import { EventEmitterPublisher } from './infrastructure/event-emitter.publisher';
import { RealtimeGateway } from './infrastructure/realtime.gateway';

/**
 * Tiempo real (research.md §16). Provee el adaptador de `EventPublisher` (bus interno) y el
 * gateway que lo difunde por Socket.io. Es global para que el `FlightWriteContext` del
 * shared-kernel dependa solo del token del puerto, no de este módulo.
 */
@Global()
@Module({
  imports: [FlightsModule],
  providers: [{ provide: EVENT_PUBLISHER, useClass: EventEmitterPublisher }, RealtimeGateway],
  exports: [EVENT_PUBLISHER],
})
export class RealtimeModule {}
