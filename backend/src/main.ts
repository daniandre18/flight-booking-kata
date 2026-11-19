import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG, type AppConfig } from './shared-kernel/infrastructure/config';
import { loadEnvFiles } from './shared-kernel/infrastructure/env';

async function bootstrap(): Promise<void> {
  loadEnvFiles();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
}

void bootstrap();
