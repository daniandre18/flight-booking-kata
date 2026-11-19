import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { httpStatusOf, type ErrorResponse, type ValidationIssue } from '@kata/shared';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { Prisma } from '../../../generated/prisma/client';
import { DomainError } from '../../domain/domain-error';

export interface MappedError {
  status: number;
  body: ErrorResponse;
}

const MESSAGES = {
  validation: 'Hay datos inválidos',
  routeNotFound: 'La ruta solicitada no existe',
  badRequest: 'La petición está mal formada',
  tooManyRequests: 'Demasiados intentos, espera un momento.',
  internal: 'Ocurrió un error inesperado. Intenta de nuevo.',
} as const;

/** Cabeceras que el throttler pone por contador con nombre (`Retry-After-ip`, `-client`). */
const NAMED_RETRY_AFTER = ['retry-after-ip', 'retry-after-client'];

/**
 * Filtro global único (DRY): toda respuesta de error tiene el formato `{ code, message, details }`
 * y nunca incluye stack, SQL ni el mensaje original de una excepción desconocida (principio VI).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      return;
    }
    const { status, body } = this.map(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception, code: body.code }, 'Error no controlado');
    }
    const response = host.switchToHttp().getResponse<Response>();
    if (body.code === 'TOO_MANY_REQUESTS') {
      setStandardRetryAfter(response);
    }
    response.status(status).json(body);
  }

  map(exception: unknown): MappedError {
    if (exception instanceof DomainError) {
      return build(exception.code, exception.message, exception.details);
    }
    if (exception instanceof ZodValidationException) {
      return build('VALIDATION_ERROR', MESSAGES.validation, toIssues(exception.getZodError()));
    }
    if (exception instanceof HttpException) {
      return fromHttpStatus(exception.getStatus());
    }
    if (isClientHttpError(exception)) {
      return build('BAD_REQUEST', MESSAGES.badRequest);
    }
    this.warnOnTransactionTimeout(exception);
    return build('INTERNAL_ERROR', MESSAGES.internal);
  }

  private warnOnTransactionTimeout(exception: unknown): void {
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2028') {
      this.logger.warn({ code: exception.code }, 'Timeout de transacción (revisar pool y maxWait)');
    }
  }
}

function build(
  code: ErrorResponse['code'],
  message: string,
  details: ErrorResponse['details'] = null,
): MappedError {
  return { status: httpStatusOf(code), body: { code, message, details } };
}

function fromHttpStatus(status: number): MappedError {
  if (status === HttpStatus.NOT_FOUND) {
    return build('ROUTE_NOT_FOUND', MESSAGES.routeNotFound);
  }
  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return build('TOO_MANY_REQUESTS', MESSAGES.tooManyRequests);
  }
  if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
    return build('BAD_REQUEST', MESSAGES.badRequest);
  }
  return build('INTERNAL_ERROR', MESSAGES.internal);
}

/** Errores del body parser (JSON inválido, 413) llegan como objetos con `status` 4xx. */
function isClientHttpError(exception: unknown): boolean {
  const status = (exception as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

function setStandardRetryAfter(response: Response): void {
  const seconds = NAMED_RETRY_AFTER.map((name) => Number(response.getHeader(name) ?? 0));
  response.setHeader('Retry-After', String(Math.max(1, ...seconds)));
}

interface ZodLikeIssue {
  path: PropertyKey[];
  message: string;
}

/** Se lee por forma (no por `instanceof`) porque shared y backend pueden cargar zod por separado. */
function toIssues(error: unknown): ValidationIssue[] {
  const issues = (error as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) {
    return [];
  }
  return (issues as ZodLikeIssue[]).map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
