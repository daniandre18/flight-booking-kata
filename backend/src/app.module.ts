import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { BookingsModule } from './bookings';
import { FlightsModule } from './flights';
import { HealthModule } from './health/health.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SeatsModule } from './seats';
import { SharedKernelModule } from './shared-kernel/shared-kernel.module';
import { ConfigModule } from './shared-kernel/infrastructure/config';
import { ApiExceptionFilter } from './shared-kernel/infrastructure/http/error.filter';
import {
  buildThrottlerOptions,
  HttpThrottlerGuard,
} from './shared-kernel/infrastructure/http/rate-limits';
import { zodValidationPipeProvider } from './shared-kernel/infrastructure/http/zod-validation';
import { AppLoggerModule } from './shared-kernel/infrastructure/logger.module';

@Module({
  imports: [
    ConfigModule,
    AppLoggerModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot(buildThrottlerOptions()),
    SharedKernelModule,
    RealtimeModule,
    FlightsModule,
    SeatsModule,
    BookingsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    zodValidationPipeProvider,
  ],
})
export class AppModule {}
