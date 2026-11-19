import { Global, Module } from '@nestjs/common';
import { EventEmitterPublisher } from '../realtime/infrastructure/event-emitter.publisher';
import { EVENT_PUBLISHER } from './application/event-publisher';
import { FLIGHT_EVENT_LOG } from './application/flight-event-log.port';
import { FLIGHT_STATS_READER } from './application/flight-stats-reader.port';
import { FLIGHT_WRITE_LOCK } from './application/flight-write-lock.port';
import { UNIT_OF_WORK } from './application/unit-of-work';
import { CLOCK } from './domain/clock';
import { PrismaFlightEventLog } from './infrastructure/persistence/flight-events.writer';
import { PrismaFlightStatsReader } from './infrastructure/persistence/flight-stats.query';
import { PrismaFlightWriteLock } from './infrastructure/persistence/flight-write-lock';
import { PrismaUnitOfWork } from './infrastructure/persistence/prisma-unit-of-work';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { SystemClock } from './infrastructure/system-clock';

/** Puertos transversales (reloj, unidad de trabajo, primitivas por vuelo y publicación). */
@Global()
@Module({
  providers: [
    PrismaService,
    PrismaUnitOfWork,
    { provide: CLOCK, useClass: SystemClock },
    { provide: UNIT_OF_WORK, useExisting: PrismaUnitOfWork },
    { provide: FLIGHT_WRITE_LOCK, useClass: PrismaFlightWriteLock },
    { provide: FLIGHT_EVENT_LOG, useClass: PrismaFlightEventLog },
    { provide: FLIGHT_STATS_READER, useClass: PrismaFlightStatsReader },
    { provide: EVENT_PUBLISHER, useClass: EventEmitterPublisher },
  ],
  exports: [
    PrismaService,
    PrismaUnitOfWork,
    CLOCK,
    UNIT_OF_WORK,
    FLIGHT_WRITE_LOCK,
    FLIGHT_EVENT_LOG,
    FLIGHT_STATS_READER,
    EVENT_PUBLISHER,
  ],
})
export class SharedKernelModule {}
