import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER, type EventPublisher } from './application/event-publisher';
import { FLIGHT_EVENT_LOG, type FlightEventLog } from './application/flight-event-log.port';
import {
  FLIGHT_STATS_READER,
  type FlightStatsReader,
} from './application/flight-stats-reader.port';
import { FLIGHT_WRITE_CONTEXT, type FlightWriteContext } from './application/flight-write-context';
import { FLIGHT_WRITE_LOCK, type FlightWriteLock } from './application/flight-write-lock.port';
import { UNIT_OF_WORK, type UnitOfWork } from './application/unit-of-work';
import { CLOCK, type Clock } from './domain/clock';
import { PrismaFlightEventLog } from './infrastructure/persistence/flight-events.writer';
import { PrismaFlightStatsReader } from './infrastructure/persistence/flight-stats.query';
import { PrismaFlightWriteLock } from './infrastructure/persistence/flight-write-lock';
import { PrismaUnitOfWork } from './infrastructure/persistence/prisma-unit-of-work';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { SystemClock } from './infrastructure/system-clock';

type FlightWriteDependencies = [
  UnitOfWork,
  FlightWriteLock,
  FlightEventLog,
  FlightStatsReader,
  EventPublisher,
  Clock,
];

/** Construye el objeto de dependencias; la tupla cuenta como un solo parámetro (`max-params`). */
function buildFlightWriteContext(
  ...[uow, writeLock, eventLog, statsReader, publisher, clock]: FlightWriteDependencies
): FlightWriteContext {
  return { uow, writeLock, eventLog, statsReader, publisher, clock };
}

/**
 * Puertos transversales (reloj, unidad de trabajo y primitivas por vuelo). `EVENT_PUBLISHER` lo
 * provee el módulo global `RealtimeModule`: el shared-kernel solo depende del token del puerto.
 */
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
    {
      provide: FLIGHT_WRITE_CONTEXT,
      useFactory: buildFlightWriteContext,
      inject: [
        UNIT_OF_WORK,
        FLIGHT_WRITE_LOCK,
        FLIGHT_EVENT_LOG,
        FLIGHT_STATS_READER,
        EVENT_PUBLISHER,
        CLOCK,
      ],
    },
  ],
  exports: [
    PrismaService,
    PrismaUnitOfWork,
    CLOCK,
    UNIT_OF_WORK,
    FLIGHT_WRITE_LOCK,
    FLIGHT_EVENT_LOG,
    FLIGHT_STATS_READER,
    FLIGHT_WRITE_CONTEXT,
  ],
})
export class SharedKernelModule {}
