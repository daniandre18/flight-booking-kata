import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { Prisma } from '../../../src/generated/prisma/client';
import { DomainError } from '../../../src/shared-kernel/domain/domain-error';
import { ApiExceptionFilter } from '../../../src/shared-kernel/infrastructure/http/error.filter';

describe('ApiExceptionFilter.map', () => {
  const filter = new ApiExceptionFilter();

  it('traduce un DomainError a su estado del contrato compartido', () => {
    expect(filter.map(new DomainError('SEAT_UNAVAILABLE', 'tomado'))).toEqual({
      status: 409,
      body: { code: 'SEAT_UNAVAILABLE', message: 'tomado', details: null },
    });
    expect(filter.map(new DomainError('FLIGHT_NOT_BOOKABLE', 'x')).status).toBe(422);
    expect(filter.map(new DomainError('HOLD_EXPIRED', 'x')).status).toBe(410);
  });

  it('traduce errores de zod a 422 VALIDATION_ERROR con la lista de campos', () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'no' });
    const mapped = filter.map(new ZodValidationException(result.error));
    expect(mapped.status).toBe(422);
    expect(mapped.body.code).toBe('VALIDATION_ERROR');
    expect(mapped.body.details).toEqual([{ path: 'email', message: expect.any(String) }]);
  });

  it('traduce 404 de ruta, 400 de parseo y errores del body parser', () => {
    expect(filter.map(new NotFoundException()).body.code).toBe('ROUTE_NOT_FOUND');
    expect(filter.map(new BadRequestException()).body).toMatchObject({ code: 'BAD_REQUEST' });
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });
    expect(filter.map(tooLarge)).toEqual({
      status: 400,
      body: { code: 'BAD_REQUEST', message: expect.any(String), details: null },
    });
  });

  it('traduce el límite de solicitudes a 429 TOO_MANY_REQUESTS', () => {
    expect(filter.map(new ThrottlerException())).toEqual({
      status: 429,
      body: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Demasiados intentos, espera un momento.',
        details: null,
      },
    });
  });

  it('no filtra stack, SQL ni el mensaje original de errores desconocidos', () => {
    const leaky = new Error('relation "secret_table" does not exist: SELECT * FROM secret_table');
    leaky.stack = 'Error: boom\n    at /app/src/secret.ts:10:5';
    const serialized = JSON.stringify(filter.map(leaky));
    expect(serialized).not.toMatch(/secret|SELECT|stack|\.ts:/);
    expect(filter.map(leaky)).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: expect.any(String), details: null },
    });
  });

  it('no expone detalles de errores de Prisma', () => {
    const unique = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on bookings_code_key',
      {
        code: 'P2002',
        clientVersion: '7.10.1',
      },
    );
    expect(JSON.stringify(filter.map(unique))).not.toMatch(/bookings_code_key|P2002/);
    const timeout = new Prisma.PrismaClientKnownRequestError('Transaction timeout', {
      code: 'P2028',
      clientVersion: '7.10.1',
    });
    expect(filter.map(timeout).body.code).toBe('INTERNAL_ERROR');
  });
});
