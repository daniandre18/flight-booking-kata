import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

/** Configuración validada al arrancar (research.md §21). */
export const APP_CONFIG = Symbol('AppConfig');

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  ADMIN_KEY: z.string().min(1, 'ADMIN_KEY es obligatoria'),
  HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  HOLD_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: z.stringbool().default(false),
  CORS_ORIGINS: z.string().default('http://localhost:4200,http://localhost:8080'),
  BODY_LIMIT: z.string().default('16kb'),
  RATE_LIMIT_MULTIPLIER: z.coerce.number().positive().default(1),
});

export interface AppConfig {
  databaseUrl: string;
  /** Tamaño del pool del adaptador pg de Prisma 7 (research.md §4). */
  dbPoolMax: number;
  adminKey: string;
  holdTtlSeconds: number;
  holdSweepIntervalMs: number;
  port: number;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  logPretty: boolean;
  /** Orígenes permitidos por CORS (principio X). */
  corsOrigins: string[];
  /** Tamaño máximo del body JSON. */
  bodyLimit: string;
  /** Multiplica los límites de solicitudes; el arnés e2e lo sube salvo en las pruebas de límites. */
  rateLimitMultiplier: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Configuración inválida: ${problems.join('; ')}`);
  }
  const values = parsed.data;
  return {
    databaseUrl: values.DATABASE_URL,
    dbPoolMax: values.DB_POOL_MAX,
    adminKey: values.ADMIN_KEY,
    holdTtlSeconds: values.HOLD_TTL_SECONDS,
    holdSweepIntervalMs: values.HOLD_SWEEP_INTERVAL_MS,
    port: values.PORT,
    logLevel: values.LOG_LEVEL,
    logPretty: values.LOG_PRETTY,
    corsOrigins: values.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    bodyLimit: values.BODY_LIMIT,
    rateLimitMultiplier: values.RATE_LIMIT_MULTIPLIER,
  };
}

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
