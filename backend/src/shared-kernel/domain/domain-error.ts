import type { ErrorCode, ValidationIssue } from '@kata/shared';

export type ErrorDetails = Record<string, unknown> | ValidationIssue[] | null;

/** Error de negocio con un código del contrato compartido; el filtro HTTP lo traduce a su estado. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetails = null,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
