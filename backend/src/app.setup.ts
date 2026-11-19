import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { RealtimeIoAdapter } from './realtime/infrastructure/realtime-io.adapter';
import { APP_CONFIG, type AppConfig } from './shared-kernel/infrastructure/config';

const ALLOWED_HEADERS = ['Content-Type', 'X-Client-Id', 'Idempotency-Key', 'X-Admin-Key'];
const EXPOSED_HEADERS = ['Retry-After', 'Idempotent-Replayed'];

/** Configuración común de la app (la usan `main.ts` y las pruebas e2e). Principio X. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
  });
  app.useBodyParser('json', { limit: config.bodyLimit });
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, config.corsOrigins));
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.enableShutdownHooks();
}
