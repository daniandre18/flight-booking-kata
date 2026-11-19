import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
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

  it('traduce 404 de ruta y 400 de parseo', () => {
    expect(filter.map(new NotFoundException()).body.code).toBe('ROUTE_NOT_FOUND');
    expect(filter.map(new BadRequestException()).body).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('no filtra detalles internos de errores desconocidos', () => {
    expect(filter.map(new Error('select * from secret'))).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: expect.any(String), details: null },
    });
  });
});
