import { Module, RequestMethod } from '@nestjs/common';
import { ClientIdSchema } from '@kata/shared';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import type { Options } from 'pino-http';
import { holderTagOf } from '../domain/holder-tag';
import { APP_CONFIG, type AppConfig } from './config';

const CENSORED = '[redactado]';

/** Rutas que pino reemplaza por `[redactado]` (principio X): credenciales y datos de pago. */
export const REDACTED_PATHS = [
  'req.headers["x-client-id"]',
  'req.headers["x-admin-key"]',
  'req.headers.authorization',
  'card',
  '*.card',
  'req.body.card',
];

/** Contexto del cliente para los logs: su `holderTag`, nunca el `clientId` en claro. */
export function holderTagFromRequest(req: IncomingMessage): string | null {
  const parsed = ClientIdSchema.safeParse(req.headers['x-client-id']);
  return parsed.success ? holderTagOf(parsed.data) : null;
}

export function buildPinoHttpOptions(config: AppConfig): Options {
  return {
    level: config.logLevel,
    transport: config.logPretty ? { target: 'pino-pretty' } : undefined,
    redact: { paths: REDACTED_PATHS, censor: CENSORED },
    customProps: (req: IncomingMessage) => ({ holderTag: holderTagFromRequest(req) }),
    autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
  };
}

/** Logs JSON con pino (principio VIII) sin credenciales ni datos de tarjeta (principio X). */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: buildPinoHttpOptions(config),
        // Comodín con nombre (path-to-regexp 8 / Express 5): el `*` por defecto de nestjs-pino
        // dispara el aviso LegacyRouteConverter al combinarse con el prefijo `/api`.
        forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
