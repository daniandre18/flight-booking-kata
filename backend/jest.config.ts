import type { Config } from 'jest';

/** Pruebas unitarias de dominio, casos de uso y contratos (sin infraestructura). */
const config: Config = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/unit', '<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  passWithNoTests: true,
  // Cobertura (constitución 1.1.0, principio V): ≥ 80 % de líneas y ramas en domain/ y
  // application/. Los puertos (`*.port.ts`, `ports/`) solo declaran tipos y tokens.
  collectCoverageFrom: [
    'src/**/domain/**/*.ts',
    'src/**/application/**/*.ts',
    '!src/**/ports/**',
    '!src/**/*.port.ts',
  ],
  coverageReporters: ['text-summary', 'text', 'lcov'],
  coverageThreshold: { global: { lines: 80, branches: 80 } },
};

export default config;
