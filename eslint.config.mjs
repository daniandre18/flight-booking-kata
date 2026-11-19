// ESLint compartido por shared, backend y frontend (flat config). Constitución 1.1.0, principio VIII.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const RAW_SQL_UNSAFE = [
  {
    property: '$queryRawUnsafe',
    message: 'SQL crudo solo con tagged templates de Prisma (principio X).',
  },
  {
    property: '$executeRawUnsafe',
    message: 'SQL crudo solo con tagged templates de Prisma (principio X).',
  },
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.angular/**',
      'backend/src/generated/**',
      '.specify/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // La constitución prohíbe console.log; warn y error quedan para fallos de arranque.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      complexity: ['error', 10],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-params': 'off',
      '@typescript-eslint/max-params': ['error', { max: 4 }],
      'no-restricted-properties': ['error', ...RAW_SQL_UNSAFE],
    },
  },
  {
    // Nest inyecta por el tipo del parámetro del constructor (emitDecoratorMetadata): esas
    // importaciones deben ser de valor, no `import type`.
    files: ['backend/**/*.ts'],
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
  },
  {
    // Frontend: sin innerHTML ni bypassSecurityTrust* (principio X, XSS).
    files: ['frontend/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...RAW_SQL_UNSAFE,
        { property: 'innerHTML', message: 'Prohibido innerHTML (principio X).' },
        { property: 'outerHTML', message: 'Prohibido outerHTML (principio X).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name=/^bypassSecurityTrust/]',
          message: 'Prohibido bypassSecurityTrust* (principio X).',
        },
      ],
    },
  },
  {
    // Pruebas: exentas solo de max-lines-per-function (justificado en plan.md, complejidad).
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
);
