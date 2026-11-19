import type { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponseSchema, type ValidationIssue } from '@kata/shared';
import { messageFor, type ClientErrorCode } from './error-messages';

/** Error de la api ya traducido: lo lanza el interceptor y lo leen los stores y páginas. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(messageFor(code));
    this.name = 'ApiError';
  }

  static from(response: HttpErrorResponse): ApiError {
    if (response.status === 0) {
      return new ApiError(0, 'NETWORK_ERROR');
    }
    const parsed = ErrorResponseSchema.safeParse(response.error);
    if (!parsed.success) {
      return new ApiError(
        response.status,
        response.status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
      );
    }
    const issues = Array.isArray(parsed.data.details) ? parsed.data.details : [];
    return new ApiError(response.status, parsed.data.code, issues);
  }
}

export function isApiError(error: unknown, ...codes: ClientErrorCode[]): error is ApiError {
  return error instanceof ApiError && (codes.length === 0 || codes.includes(error.code));
}
