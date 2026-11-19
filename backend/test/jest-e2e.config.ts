import type { Config } from 'jest';

/**
 * Pruebas e2e contra PostgreSQL real: Testcontainers (postgres:16) o TEST_DATABASE_URL.
 * Se ejecutan en serie (--runInBand) porque comparten la base.
 * El script usa `--experimental-vm-modules`: Prisma 7 carga su compilador de consultas WASM con
 * `import()` dinámico, que la VM CommonJS de Jest no permite sin esa opción.
 */
const config: Config = {
  testEnvironment: 'node',
  rootDir: '..',
  roots: ['<rootDir>/test/e2e'],
  testMatch: ['**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  globalSetup: '<rootDir>/test/e2e/support/global-setup.ts',
  globalTeardown: '<rootDir>/test/e2e/support/global-teardown.ts',
  testTimeout: 60_000,
};

export default config;
