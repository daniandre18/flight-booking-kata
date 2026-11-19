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

interface MappedError {
  status: number;
  body: ErrorResponse;
}

/** Filtro global: toda respuesta de error tiene el formato `{ code, message, details }`. */
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
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }

  map(exception: unknown): MappedError {
    if (exception instanceof DomainError) {
      return this.build(exception.code, exception.message, exception.details);
    }
    if (exception instanceof ZodValidationException) {
      return this.build(
        'VALIDATION_ERROR',
        'Hay datos inválidos',
        toIssues(exception.getZodError()),
      );
    }
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2028') {
      this.logger.warn({ code: exception.code }, 'Timeout de transacción (revisar pool y maxWait)');
    }
    return this.build('INTERNAL_ERROR', 'Ocurrió un error inesperado. Intenta de nuevo.');
  }

  private fromHttpException(exception: HttpException): MappedError {
    const status = exception.getStatus();
    if (status === HttpStatus.NOT_FOUND) {
      return this.build('ROUTE_NOT_FOUND', 'La ruta solicitada no existe');
    }
    if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
      return this.build('BAD_REQUEST', 'La petición está mal formada');
    }
    return this.build('INTERNAL_ERROR', 'Ocurrió un error inesperado. Intenta de nuevo.');
  }

  private build(
    code: ErrorResponse['code'],
    message: string,
    details: ErrorResponse['details'] = null,
  ): MappedError {
    return { status: httpStatusOf(code), body: { code, message, details } };
  }
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
