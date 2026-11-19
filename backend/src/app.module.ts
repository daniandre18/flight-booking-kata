import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { FlightsModule } from './flights';
import { HealthModule } from './health/health.module';
import { SharedKernelModule } from './shared-kernel/shared-kernel.module';
import { ConfigModule } from './shared-kernel/infrastructure/config';
import { ApiExceptionFilter } from './shared-kernel/infrastructure/http/error.filter';
import { zodValidationPipeProvider } from './shared-kernel/infrastructure/http/zod-validation';
import { AppLoggerModule } from './shared-kernel/infrastructure/logger.module';

@Module({
  imports: [
    ConfigModule,
    AppLoggerModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    SharedKernelModule,
    FlightsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }, zodValidationPipeProvider],
})
export class AppModule {}
