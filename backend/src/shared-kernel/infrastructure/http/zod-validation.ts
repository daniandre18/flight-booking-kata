import { type Provider } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';

/**
 * Validación global con los esquemas zod de `@kata/shared` (DTOs creados con `createZodDto`).
 * Los errores llegan al filtro como ZodValidationException y se responden 422 VALIDATION_ERROR.
 */
export const zodValidationPipeProvider: Provider = {
  provide: APP_PIPE,
  useClass: ZodValidationPipe,
};
