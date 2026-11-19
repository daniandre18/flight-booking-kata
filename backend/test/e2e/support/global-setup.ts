import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

declare global {
  var __E2E_POSTGRES__: StartedPostgreSqlContainer | undefined;
}

/**
 * Levanta PostgreSQL 16 con Testcontainers (o usa TEST_DATABASE_URL) y aplica las migraciones
 * una sola vez. Los workers heredan TEST_DATABASE_URL por process.env.
 */
export default async function globalSetup(): Promise<void> {
  let databaseUrl = process.env.TEST_DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === '') {
    const container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('kata_test')
      .withUsername('kata')
      .withPassword('kata')
      .start();
    globalThis.__E2E_POSTGRES__ = container;
    databaseUrl = container.getConnectionUri();
    process.env.TEST_DATABASE_URL = databaseUrl;
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}
