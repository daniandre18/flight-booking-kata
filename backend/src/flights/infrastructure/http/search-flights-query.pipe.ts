import { Inject, Injectable, type PipeTransform } from '@nestjs/common';
import { createSearchFlightsQuerySchema, type SearchFlightsQuery } from '@kata/shared';
import { ZodValidationException } from 'nestjs-zod';
import { CLOCK, type Clock } from '../../../shared-kernel/domain/clock';

/**
 * Valida la búsqueda con el esquema de shared (DRY) usando el reloj inyectado: "fecha pasada" se
 * decide con el mismo reloj que el resto del backend (y que `FakeClock` en las pruebas).
 */
@Injectable()
export class SearchFlightsQueryPipe implements PipeTransform<unknown, SearchFlightsQuery> {
  private readonly schema: ReturnType<typeof createSearchFlightsQuerySchema>;

  constructor(@Inject(CLOCK) clock: Clock) {
    this.schema = createSearchFlightsQuerySchema(() => clock.now());
  }

  transform(value: unknown): SearchFlightsQuery {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new ZodValidationException(parsed.error);
    }
    return parsed.data;
  }
}
