import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { CLOCK } from '../../../src/shared-kernel/domain/clock';
import { EVENT_PUBLISHER } from '../../../src/shared-kernel/application/event-publisher';
import { FLIGHT_EVENT_LOG } from '../../../src/shared-kernel/application/flight-event-log.port';
import { FLIGHT_STATS_READER } from '../../../src/shared-kernel/application/flight-stats-reader.port';
import { FLIGHT_WRITE_LOCK } from '../../../src/shared-kernel/application/flight-write-lock.port';
import { UNIT_OF_WORK } from '../../../src/shared-kernel/application/unit-of-work';
import {
  FLIGHT_WRITE_CONTEXT,
  type FlightWriteContext,
} from '../../../src/shared-kernel/application/flight-write-context';
import { RealtimeModule } from '../../../src/realtime/realtime.module';
import { ConfigModule } from '../../../src/shared-kernel/infrastructure/config';
import { SharedKernelModule } from '../../../src/shared-kernel/shared-kernel.module';

describe('FlightWriteContext', () => {
  it('el módulo resuelve el contexto con sus seis dependencias', async () => {
    Object.assign(process.env, { DATABASE_URL: 'postgresql://u:p@localhost:1/db', ADMIN_KEY: 'k' });
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, EventEmitterModule.forRoot(), SharedKernelModule, RealtimeModule],
    }).compile();
    const context = moduleRef.get<FlightWriteContext>(FLIGHT_WRITE_CONTEXT);
    expect(Object.keys(context).sort()).toEqual(
      ['clock', 'eventLog', 'publisher', 'statsReader', 'uow', 'writeLock'].sort(),
    );
    expect(context.clock).toBe(moduleRef.get(CLOCK));
    expect(context.uow).toBe(moduleRef.get(UNIT_OF_WORK));
    expect(context.writeLock).toBe(moduleRef.get(FLIGHT_WRITE_LOCK));
    expect(context.eventLog).toBe(moduleRef.get(FLIGHT_EVENT_LOG));
    expect(context.statsReader).toBe(moduleRef.get(FLIGHT_STATS_READER));
    expect(context.publisher).toBe(moduleRef.get(EVENT_PUBLISHER));
    for (const dependency of Object.values(context)) {
      expect(dependency).toBeTruthy();
    }
  });
});
