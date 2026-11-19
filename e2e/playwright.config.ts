import { defineConfig } from '@playwright/test';

/**
 * Prueba de dos pestañas (T179) contra el stack levantado (`docker compose up`). Usa el Chrome
 * instalado (`channel: 'chrome'`), así que no descarga navegadores. No entra en `pnpm test`:
 * se corre con `pnpm test:e2e:ui`. BASE_URL cambia el destino (por defecto la web de compose).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
});
