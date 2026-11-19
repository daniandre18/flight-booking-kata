import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import { APP_CONFIG, type AppConfig } from './config';

const CENSORED = '[redactado]';

/** Logs JSON con pino; nunca se registran la clave de admin ni los datos de la tarjeta. */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          transport: config.logPretty ? { target: 'pino-pretty' } : undefined,
          redact: {
            paths: [
              'req.headers["x-admin-key"]',
              'req.headers.authorization',
              'card.number',
              'card.cvv',
              '*.card.number',
              '*.card.cvv',
            ],
            censor: CENSORED,
          },
          customProps: (req: IncomingMessage) => ({ clientId: req.headers['x-client-id'] ?? null }),
          autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
