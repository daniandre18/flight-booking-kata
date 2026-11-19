import {
  BookingLookupRequestSchema,
  ERROR_HTTP_STATUS,
  ErrorResponseSchema,
  createCreateBookingRequestSchema,
  createSearchFlightsQuerySchema,
  parseSeatCode,
  seatTypeOf,
  toBogotaDate,
} from '../src/index';

// 2026-11-19 03:00 UTC = 2026-11-18 22:00 en Bogotá.
const NOW = new Date('2026-11-19T03:00:00Z');
const now = (): Date => NOW;

describe('toBogotaDate', () => {
  it('usa el día de Bogotá, no el de UTC', () => {
    expect(toBogotaDate(NOW)).toBe('2026-11-18');
  });
});

describe('SearchFlightsQuery', () => {
  const schema = createSearchFlightsQuerySchema(now);

  it('acepta hoy en Bogotá aunque en UTC ya sea mañana', () => {
    expect(
      schema.safeParse({ origin: 'BOG', destination: 'MDE', date: '2026-11-18' }).success,
    ).toBe(true);
  });

  it('rechaza origen igual a destino', () => {
    const result = schema.safeParse({ origin: 'BOG', destination: 'BOG', date: '2026-11-20' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('destination');
  });

  it('rechaza una fecha pasada', () => {
    const result = schema.safeParse({ origin: 'BOG', destination: 'MDE', date: '2026-11-17' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('date');
  });

  it('rechaza fechas inexistentes y aeropuertos desconocidos', () => {
    expect(
      schema.safeParse({ origin: 'BOG', destination: 'MDE', date: '2026-02-30' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ origin: 'XXX', destination: 'MDE', date: '2026-11-20' }).success,
    ).toBe(false);
  });
});

describe('códigos de asiento', () => {
  it.each(['1A', '12C', '30F'])('acepta %s', (code) => {
    expect(parseSeatCode(code)).not.toBeNull();
  });

  it.each(['0A', '31A', '12G', 'A12', '12c', ''])('rechaza %s', (code) => {
    expect(parseSeatCode(code)).toBeNull();
  });

  it('deriva el tipo desde la letra', () => {
    expect(seatTypeOf('A')).toBe('WINDOW');
    expect(seatTypeOf('E')).toBe('MIDDLE');
    expect(seatTypeOf('D')).toBe('AISLE');
  });
});

describe('CreateBookingRequest', () => {
  const schema = createCreateBookingRequestSchema(now);
  const valid = {
    flightId: '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10',
    buyer: { name: 'Ana Pérez', email: 'ana@example.com' },
    passengers: [
      { seatId: '12C', name: 'Ana Pérez' },
      { seatId: '12D', name: 'Luis Gómez' },
    ],
    card: { number: '4111111111111111', expiry: '11/26', cvv: '123' },
  };

  it('acepta una solicitud válida (tarjeta que vence este mes)', () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it('rechaza una tarjeta vencida', () => {
    const result = schema.safeParse({ ...valid, card: { ...valid.card, expiry: '10/26' } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.join('.')).toBe('card.expiry');
  });

  it('rechaza asientos repetidos y más de 4 pasajeros', () => {
    const repeated = [valid.passengers[0], valid.passengers[0]];
    expect(schema.safeParse({ ...valid, passengers: repeated }).success).toBe(false);
    const five = ['1A', '1B', '1C', '1D', '1E'].map((seatId) => ({ seatId, name: 'Ana Pérez' }));
    expect(schema.safeParse({ ...valid, passengers: five }).success).toBe(false);
  });

  it('valida número, CVV y correo', () => {
    expect(schema.safeParse({ ...valid, card: { ...valid.card, number: '4111' } }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...valid, card: { ...valid.card, cvv: '12' } }).success).toBe(false);
    expect(schema.safeParse({ ...valid, buyer: { ...valid.buyer, email: 'no' } }).success).toBe(
      false,
    );
  });
});

describe('BookingLookupRequest', () => {
  it('normaliza el código a mayúsculas y el correo a minúsculas', () => {
    expect(
      BookingLookupRequestSchema.parse({ code: 'ab12cd', email: ' Ana@Example.COM ' }),
    ).toEqual({ code: 'AB12CD', email: 'ana@example.com' });
  });
});

describe('errores', () => {
  it('reserva el 409 para conflictos de asiento y usa 422 para reglas de negocio', () => {
    expect(ERROR_HTTP_STATUS.SEAT_UNAVAILABLE).toBe(409);
    expect(ERROR_HTTP_STATUS.FLIGHT_NOT_BOOKABLE).toBe(422);
    expect(ERROR_HTTP_STATUS.FLIGHT_STATUS_CONFLICT).toBe(422);
    expect(ERROR_HTTP_STATUS.ADMIN_UNAUTHORIZED).toBe(401);
  });

  it('valida el formato único { code, message, details }', () => {
    expect(
      ErrorResponseSchema.safeParse({ code: 'HOLD_EXPIRED', message: 'x', details: null }).success,
    ).toBe(true);
    expect(
      ErrorResponseSchema.safeParse({ code: 'NOPE', message: 'x', details: null }).success,
    ).toBe(false);
  });
});
