import {
  BookingDtoSchema,
  ClientIdSchema,
  FlightDtoSchema,
  FlightSeatParamsSchema,
  FlightStatsDtoSchema,
  ActivityEntryDtoSchema,
  HoldSeatResponseSchema,
  MyHoldsResponseSchema,
  SeatDtoSchema,
  SeatMapSnapshotSchema,
  UpdateFlightStatusRequestSchema,
  allSeatPositions,
  formatSeatCode,
  httpStatusOf,
  isCardExpiryInFuture,
  isValidIsoDate,
} from '../src/index';

const FLIGHT_ID = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';
const ISO = '2026-11-19T14:03:11.204Z';
const flight = {
  id: FLIGHT_ID,
  seq: 3,
  flightNumber: 'KT1000',
  origin: 'BOG',
  destination: 'MDE',
  scheduledDepartureAt: ISO,
  departureAt: ISO,
  arrivalAt: '2026-11-19T15:00:00.000Z',
  durationMinutes: 57,
  fare: 210_000,
  status: 'SCHEDULED',
  delayed: false,
  availableSeats: 179,
  capacity: 180,
};
const seat = {
  seatId: '12C',
  row: 12,
  letter: 'C',
  type: 'AISLE',
  status: 'HELD',
  price: 210_000,
  holderTag: '9f86d081884c7d65',
  holdExpiresAt: ISO,
};

describe('ClientIdSchema', () => {
  it('acepta solo UUID v4', () => {
    expect(ClientIdSchema.safeParse('3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192').success).toBe(true);
    expect(ClientIdSchema.safeParse('6ba7b810-9dad-11d1-80b4-00c04fd430c8').success).toBe(false); // v1
    expect(ClientIdSchema.safeParse('a43ba235-6321-5a88-b282-0af2d4095301').success).toBe(false); // v5
    expect(ClientIdSchema.safeParse('no-es-un-uuid').success).toBe(false);
  });
});

describe('DTOs de vuelos y asientos', () => {
  it('validan una respuesta correcta', () => {
    expect(FlightDtoSchema.safeParse(flight).success).toBe(true);
    expect(SeatDtoSchema.safeParse(seat).success).toBe(true);
    expect(
      SeatMapSnapshotSchema.safeParse({ flight, seats: [seat], seq: 3, serverNow: ISO }).success,
    ).toBe(true);
  });

  it('rechazan valores fuera de contrato', () => {
    expect(FlightDtoSchema.safeParse({ ...flight, status: 'BORRADO' }).success).toBe(false);
    expect(FlightDtoSchema.safeParse({ ...flight, availableSeats: -1 }).success).toBe(false);
    expect(SeatDtoSchema.safeParse({ ...seat, holderTag: 'clientId-en-claro' }).success).toBe(
      false,
    );
    expect(SeatDtoSchema.safeParse({ ...seat, row: 31 }).success).toBe(false);
  });

  it('validan las respuestas de bloqueo y de mis bloqueos', () => {
    const hold = {
      flightId: FLIGHT_ID,
      seatId: '12C',
      holdExpiresAt: ISO,
      holderTag: seat.holderTag,
      seq: 4,
      serverNow: ISO,
    };
    expect(HoldSeatResponseSchema.safeParse(hold).success).toBe(true);
    const mine = {
      holderTag: seat.holderTag,
      serverNow: ISO,
      holds: [{ flightId: FLIGHT_ID, seatIds: ['12C'], holdExpiresAt: ISO }],
    };
    expect(MyHoldsResponseSchema.safeParse(mine).success).toBe(true);
    const tooMany = {
      ...mine,
      holds: [{ ...mine.holds[0], seatIds: ['1A', '1B', '1C', '1D', '1E'] }],
    };
    expect(MyHoldsResponseSchema.safeParse(tooMany).success).toBe(false);
  });

  it('validan estadísticas y actividad', () => {
    const stats = {
      flightId: FLIGHT_ID,
      available: 170,
      held: 2,
      booked: 8,
      total: 180,
      occupancyPercent: 4.4,
      seq: 9,
    };
    expect(FlightStatsDtoSchema.safeParse(stats).success).toBe(true);
    expect(FlightStatsDtoSchema.safeParse({ ...stats, occupancyPercent: 101 }).success).toBe(false);
    const entry = {
      seq: 9,
      type: 'SEAT_RELEASED',
      seatId: '12C',
      status: 'AVAILABLE',
      reason: 'EXPIRED',
      occurredAt: ISO,
    };
    expect(ActivityEntryDtoSchema.safeParse(entry).success).toBe(true);
    expect(
      ActivityEntryDtoSchema.safeParse({ ...entry, seatId: null, type: 'FLIGHT_UPDATED' }).success,
    ).toBe(true);
  });
});

describe('UpdateFlightStatusRequest', () => {
  it('acepta retraso con hora y cancelación', () => {
    expect(
      UpdateFlightStatusRequestSchema.safeParse({ status: 'DELAYED', newDepartureAt: ISO }).success,
    ).toBe(true);
    expect(UpdateFlightStatusRequestSchema.safeParse({ status: 'CANCELLED' }).success).toBe(true);
  });

  it('rechaza retraso sin hora y estados que solo pone el sistema', () => {
    expect(UpdateFlightStatusRequestSchema.safeParse({ status: 'DELAYED' }).success).toBe(false);
    expect(UpdateFlightStatusRequestSchema.safeParse({ status: 'SOLD_OUT' }).success).toBe(false);
  });
});

describe('BookingDto', () => {
  const booking = {
    code: 'KR19EX',
    flight,
    buyer: { name: 'Ana Pérez', email: 'ana@example.com' },
    passengers: [{ seatId: '12C', name: 'Ana Pérez', type: 'AISLE' }],
    total: 210_000,
    cardBrand: 'VISA',
    cardLast4: '1111',
    createdAt: ISO,
  };

  it('exige marca y últimos 4 dígitos, nunca el número completo', () => {
    expect(BookingDtoSchema.safeParse(booking).success).toBe(true);
    expect(BookingDtoSchema.safeParse({ ...booking, cardLast4: '4111111111111111' }).success).toBe(
      false,
    );
    expect(BookingDtoSchema.safeParse({ ...booking, cardBrand: 'AMEX' }).success).toBe(false);
  });
});

describe('parámetros de ruta', () => {
  it('validan flightId y código de asiento', () => {
    expect(FlightSeatParamsSchema.safeParse({ flightId: FLIGHT_ID, seatId: '12C' }).success).toBe(
      true,
    );
    expect(FlightSeatParamsSchema.safeParse({ flightId: 'x', seatId: '12C' }).success).toBe(false);
    expect(FlightSeatParamsSchema.safeParse({ flightId: FLIGHT_ID, seatId: '31A' }).success).toBe(
      false,
    );
  });
});

describe('utilidades', () => {
  it('genera los 180 asientos y su código', () => {
    const positions = allSeatPositions();
    expect(positions).toHaveLength(180);
    expect(formatSeatCode(positions[0]!.row, positions[0]!.letter)).toBe('1A');
    expect(formatSeatCode(positions[179]!.row, positions[179]!.letter)).toBe('30F');
  });

  it('valida fechas y vencimientos', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('28/02/2026')).toBe(false);
    expect(isCardExpiryInFuture('12/26', new Date('2026-12-31T23:00:00Z'))).toBe(true);
    expect(isCardExpiryInFuture('11/26', new Date('2026-12-01T00:00:00Z'))).toBe(false);
    expect(isCardExpiryInFuture('mal', new Date('2026-12-01T00:00:00Z'))).toBe(false);
  });

  it('expone el estado HTTP de cada código', () => {
    expect(httpStatusOf('TOO_MANY_REQUESTS')).toBe(429);
    expect(httpStatusOf('SERVICE_UNAVAILABLE')).toBe(503);
  });
});
