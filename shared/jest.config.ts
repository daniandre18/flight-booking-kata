import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  // Los imports relativos usan `.js` (NodeNext); en las pruebas apuntan al fuente `.ts`.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  // Cobertura (constitución 1.1.0, principio V): ≥ 80 % de líneas y ramas en shared/.
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coverageReporters: ['text-summary', 'text', 'lcov'],
  coverageThreshold: { global: { lines: 80, branches: 80 } },
};

export default config;
