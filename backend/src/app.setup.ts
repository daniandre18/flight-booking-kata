import { type INestApplication, RequestMethod } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

/** Configuración común de la app (la usan `main.ts` y las pruebas e2e). */
export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.enableShutdownHooks();
}
