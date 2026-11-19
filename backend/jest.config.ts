import type { Config } from 'jest';

/** Pruebas unitarias del dominio y la aplicación (sin infraestructura). */
const config: Config = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/unit', '<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  passWithNoTests: true,
};

export default config;
