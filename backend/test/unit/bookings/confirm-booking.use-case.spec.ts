import { BookingDtoSchema, DECLINED_TEST_CARD, type CreateBookingRequest } from '@kata/shared';
import { toBookingDto } from '../../../src/bookings/application/booking-dto.mapper';
import {
  ConfirmBookingUseCase,
  MAX_BOOKING_CODE_ATTEMPTS,
} from '../../../src/bookings/application/confirm-booking.use-case';
import type { BookingPorts } from '../../../src/bookings/application/ports/booking-ports';
import {
  InMemoryBookingStore,
  InMemoryIdempotencyStore,
  ScriptedPaymentGateway,
  StubFlightStatusPort,
} from '../../doubles/bookings.doubles';
import { InMemoryFlightQuery, sampleFlightView } from '../../doubles/flights.doubles';
import { InMemorySeatStore } from '../../doubles/seats.doubles';
import {
  buildFlightWriteContext,
  type FlightWriteDoubles,
} from '../../doubles/shared-kernel.doubles';

const FLIGHT = sampleFlightView();
const CLIENT = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';
const KEY = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
const CARD = '4111111111111111';

function request(overrides: Partial<CreateBookingRequest> = {}): CreateBookingRequest {
  return {
    flightId: FLIGHT.id,
    buyer: { name: 'Ana Gómez', email: 'Ana@Correo.co' },
    passengers: [
      { seatId: '12C', name: 'Ana Gómez' },
      { seatId: '12D', name: 'Luis Pérez' },
    ],
    card: { number: CARD, expiry: '12/30', cvv: '123' },
    ...overrides,
  };
}

describe('ConfirmBookingUseCase', () => {
  let doubles: FlightWriteDoubles;
  let seats: InMemorySeatStore;
  let idempotency: InMemoryIdempotencyStore;
  let bookings: InMemoryBookingStore;
  let payments: ScriptedPaymentGateway;
  let flightStatus: StubFlightStatusPort;
  let flights: InMemoryFlightQuery;
  let ports: BookingPorts;
  let holdExpiresAt: Date;

  beforeEach(() => {
    doubles = buildFlightWriteContext();
    seats = new InMemorySeatStore();
    seats.addFlight(FLIGHT.id);
    idempotency = new InMemoryIdempotencyStore();
    bookings = new InMemoryBookingStore();
    [seats, idempotency, bookings].forEach((store) => doubles.uow.enlist(store));
    payments = new ScriptedPaymentGateway();
    flightStatus = new StubFlightStatusPort();
    flights = new InMemoryFlightQuery();
    flights.add(FLIGHT);
    doubles.writeLock.setFlight(FLIGHT.id, {
      status: 'SCHEDULED',
      departureAt: FLIGHT.departureAt,
    });
    doubles.statsReader.summaries.set(FLIGHT.id, {
      flightId: FLIGHT.id,
      status: 'SCHEDULED',
      scheduledDepartureAt: FLIGHT.scheduledDepartureAt,
      departureAt: FLIGHT.departureAt,
      arrivalAt: FLIGHT.arrivalAt,
      delayed: false,
      counts: { available: 178, held: 0, booked: 2, total: 180 },
    });
    ports = { idempotency, seats, payments, bookings, lookup: bookings, flights, flightStatus };
    holdExpiresAt = new Date(doubles.clock.now().getTime() + 600_000);
    seats.forceHold(FLIGHT.id, '12C', CLIENT, holdExpiresAt);
    seats.forceHold(FLIGHT.id, '12D', CLIENT, holdExpiresAt);
  });

  const useCase = (generateCode?: () => string) =>
    new ConfirmBookingUseCase(doubles.context, ports, generateCode);
  const confirm = (body = request(), key = KEY) =>
    useCase().execute({ clientId: CLIENT, idempotencyKey: key, request: body });
  const codeOf = (promise: Promise<unknown>) =>
    promise.catch((error: { code: string }) => error.code);
  const expectNothingCommitted = () => {
    expect(bookings.all).toEqual([]);
    expect(idempotency.size).toBe(0);
    expect(doubles.eventLog.events).toEqual([]);
    expect(doubles.publisher.published).toEqual([]);
  };

  it('confirma: asientos BOOKED, código, total = tarifa × asientos y solo marca y últimos 4', async () => {
    const result = await confirm();
    expect(result.replayed).toBe(false);
    expect(result.view.booking).toMatchObject({
      code: expect.stringMatching(/^[A-Z0-9]{6}$/),
      total: FLIGHT.fare * 2,
      cardBrand: 'VISA',
      cardLast4: '1111',
      buyerEmail: 'ana@correo.co',
      passengers: [
        { row: 12, letter: 'C', name: 'Ana Gómez' },
        { row: 12, letter: 'D', name: 'Luis Pérez' },
      ],
    });
    expect(seats.seat(FLIGHT.id, '12C').status).toBe('BOOKED');
    expect(seats.seat(FLIGHT.id, '12D').status).toBe('BOOKED');
    expect(payments.charges).toEqual([FLIGHT.fare * 2]);
    expect(doubles.writeLock.acquired).toEqual([{ flightId: FLIGHT.id, condition: 'bookable' }]);
    expect(JSON.stringify(bookings.all)).not.toContain(CARD);
    expect(BookingDtoSchema.parse(toBookingDto(result.view)).passengers[0]).toEqual({
      seatId: '12C',
      name: 'Ana Gómez',
      type: 'AISLE',
    });
  });

  it('registra un SEAT_BOOKED por asiento y publica solo después del commit', async () => {
    const publish = jest.spyOn(doubles.publisher, 'publish').mockImplementation((events) => {
      expect(doubles.uow.isActive).toBe(false);
      doubles.publisher.published.push(...events);
    });
    await confirm();
    expect(doubles.eventLog.events.map((event) => [event.type, event.seq])).toEqual([
      ['SEAT_BOOKED', 1],
      ['SEAT_BOOKED', 2],
    ]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(doubles.publisher.published).toEqual([
      expect.objectContaining({ type: 'SeatBooked', seatCode: '12C', seq: 1 }),
      expect.objectContaining({ type: 'SeatBooked', seatCode: '12D', seq: 2 }),
      expect.objectContaining({ type: 'FlightStatsChanged', seq: 2 }),
    ]);
    expect(JSON.stringify(doubles.publisher.published)).not.toContain(CLIENT);
  });

  it('con los bloqueos vencidos da HOLD_EXPIRED y deshace todo', async () => {
    doubles.clock.advance(601_000);
    await expect(codeOf(confirm())).resolves.toBe('HOLD_EXPIRED');
    expectNothingCommitted();
    expect(payments.charges).toEqual([]);
    expect(doubles.uow.rollbacks).toBe(1);
  });

  it('si los pasajeros no cubren todos los bloqueos da PASSENGERS_MISMATCH y deshace todo', async () => {
    const body = request({ passengers: [{ seatId: '12C', name: 'Ana Gómez' }] });
    await expect(codeOf(confirm(body))).resolves.toBe('PASSENGERS_MISMATCH');
    expectNothingCommitted();
    expect(seats.seat(FLIGHT.id, '12C')).toMatchObject({ status: 'HELD', heldBy: CLIENT });
  });

  it.each([
    [
      'la tarjeta de prueba',
      () => request({ card: { number: DECLINED_TEST_CARD, expiry: '12/30', cvv: '123' } }),
    ],
    ['un rechazo programado', () => (payments.declineNext(), request())],
  ])('con %s da PAYMENT_DECLINED y conserva los bloqueos', async (_case, body) => {
    await expect(codeOf(confirm(body()))).resolves.toBe('PAYMENT_DECLINED');
    expectNothingCommitted();
    expect(seats.seat(FLIGHT.id, '12C')).toMatchObject({ status: 'HELD', holdExpiresAt });
    expect(seats.seat(FLIGHT.id, '12D')).toMatchObject({ status: 'HELD', holdExpiresAt });
  });

  it('la misma clave repite la reserva sin cobrar de nuevo ni publicar', async () => {
    const first = await confirm();
    const published = doubles.publisher.published.length;
    const second = await confirm();
    expect(second.replayed).toBe(true);
    expect(second.view.booking.code).toBe(first.view.booking.code);
    expect(payments.charges).toHaveLength(1);
    expect(bookings.all).toHaveLength(1);
    expect(doubles.publisher.published).toHaveLength(published);
  });

  it('la misma clave con otro cuerpo da IDEMPOTENCY_KEY_REUSED', async () => {
    await confirm();
    const other = request({ buyer: { name: 'Otra Persona', email: 'otra@correo.co' } });
    await expect(codeOf(confirm(other))).resolves.toBe('IDEMPOTENCY_KEY_REUSED');
    expect(bookings.all).toHaveLength(1);
  });

  it('tras un fallo la clave no queda guardada y el reintento se procesa', async () => {
    payments.declineNext();
    await expect(codeOf(confirm())).resolves.toBe('PAYMENT_DECLINED');
    const retry = await confirm();
    expect(retry.replayed).toBe(false);
    expect(payments.charges).toHaveLength(2);
  });

  it('al reservar el último asiento publica FlightUpdated con SOLD_OUT', async () => {
    flightStatus.soldOut = true;
    await confirm();
    expect(flightStatus.calls).toEqual([FLIGHT.id]);
    expect(doubles.eventLog.events.map((event) => event.type)).toEqual([
      'SEAT_BOOKED',
      'SEAT_BOOKED',
      'FLIGHT_UPDATED',
    ]);
    expect(doubles.eventLog.events[2]?.payload).toMatchObject({
      status: 'SOLD_OUT',
      change: 'SOLD_OUT',
    });
    const types = doubles.publisher.published.map((event) => event.type);
    expect(types).toEqual(['SeatBooked', 'SeatBooked', 'FlightUpdated', 'FlightStatsChanged']);
    expect(doubles.publisher.published[2]).toMatchObject({
      status: 'SOLD_OUT',
      change: 'SOLD_OUT',
      seq: 3,
      delayed: false,
    });
    expect(doubles.publisher.published[3]).toMatchObject({ change: 'SOLD_OUT', seq: 3 });
  });

  it('un vuelo cancelado da FLIGHT_NOT_BOOKABLE y no guarda la clave', async () => {
    doubles.writeLock.setFlight(FLIGHT.id, {
      status: 'CANCELLED',
      departureAt: FLIGHT.departureAt,
    });
    await expect(codeOf(confirm())).resolves.toBe('FLIGHT_NOT_BOOKABLE');
    expectNothingCommitted();
  });

  it('si el vuelo no se puede leer da FLIGHT_NOT_FOUND', async () => {
    flights.flights.clear();
    await expect(codeOf(confirm())).resolves.toBe('FLIGHT_NOT_FOUND');
    expectNothingCommitted();
  });

  it('reintenta con otro código si el generado ya existe', async () => {
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
    bookings.seed({
      id: 'booking-0',
      code: 'AAAAAA',
      flightId: FLIGHT.id,
      buyerName: 'Otra Persona',
      buyerEmail: 'otra@correo.co',
      total: FLIGHT.fare,
      cardBrand: 'VISA',
      cardLast4: '4242',
      createdAt: doubles.clock.now(),
      seats: { '1A': 'Otra Persona' },
    });
    const result = await useCase(() => codes.shift() ?? 'ZZZZZZ').execute({
      clientId: CLIENT,
      idempotencyKey: KEY,
      request: request(),
    });
    expect(result.view.booking.code).toBe('BBBBBB');
  });

  it(`falla tras ${MAX_BOOKING_CODE_ATTEMPTS} colisiones seguidas y deshace todo`, async () => {
    bookings.seed({
      id: 'booking-0',
      code: 'AAAAAA',
      flightId: FLIGHT.id,
      buyerName: 'Otra Persona',
      buyerEmail: 'otra@correo.co',
      total: FLIGHT.fare,
      cardBrand: 'VISA',
      cardLast4: '4242',
      createdAt: doubles.clock.now(),
      seats: { '1A': 'Otra Persona' },
    });
    const execution = useCase(() => 'AAAAAA').execute({
      clientId: CLIENT,
      idempotencyKey: KEY,
      request: request(),
    });
    await expect(execution).rejects.toThrow('código de reserva único');
    expect(seats.seat(FLIGHT.id, '12C').status).toBe('HELD');
  });
});
