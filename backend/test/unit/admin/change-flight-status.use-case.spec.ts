import { ChangeFlightStatusUseCase } from '../../../src/admin/application/change-flight-status.use-case';
import type { FlightView } from '../../../src/flights';
import { DomainError } from '../../../src/shared-kernel/domain/domain-error';
import {
  InMemoryFlightQuery,
  InMemoryFlightStatus,
  sampleFlightView,
} from '../../doubles/flights.doubles';
import { InMemorySeatStore } from '../../doubles/seats.doubles';
import {
  buildFlightWriteContext,
  type FlightWriteDoubles,
} from '../../doubles/shared-kernel.doubles';

const CLIENT = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';
const MINUTE = 60_000;

describe('ChangeFlightStatusUseCase', () => {
  let doubles: FlightWriteDoubles;
  let flights: InMemoryFlightQuery;
  let status: InMemoryFlightStatus;
  let seats: InMemorySeatStore;
  let useCase: ChangeFlightStatusUseCase;
  let flight: FlightView;

  function setUp(overrides: Partial<FlightView> = {}): void {
    doubles = buildFlightWriteContext();
    const departureAt = new Date(doubles.clock.now().getTime() + 24 * 60 * MINUTE);
    flight = sampleFlightView({
      departureAt,
      scheduledDepartureAt: departureAt,
      arrivalAt: new Date(departureAt.getTime() + 60 * MINUTE),
      ...overrides,
    });
    flights = new InMemoryFlightQuery();
    flights.add(flight);
    status = new InMemoryFlightStatus(flights, doubles.writeLock);
    seats = new InMemorySeatStore();
    seats.addFlight(flight.id);
    doubles.uow.enlist(status);
    doubles.uow.enlist(seats);
    doubles.writeLock.setFlight(flight.id, {
      status: flight.status,
      departureAt: flight.departureAt,
    });
    doubles.statsReader.summaries.set(flight.id, {
      flightId: flight.id,
      status: flight.status,
      scheduledDepartureAt: flight.scheduledDepartureAt,
      departureAt: flight.departureAt,
      arrivalAt: flight.arrivalAt,
      delayed: false,
      counts: { available: 180, held: 0, booked: 0, total: 180 },
    });
    useCase = new ChangeFlightStatusUseCase(doubles.context, status, seats, flights);
  }

  const delay = (minutes: number) => ({
    flightId: flight.id,
    request: {
      status: 'DELAYED' as const,
      newDepartureAt: new Date(flight.departureAt.getTime() + minutes * MINUTE).toISOString(),
    },
  });
  const cancel = () => ({ flightId: flight.id, request: { status: 'CANCELLED' as const } });

  beforeEach(() => setUp());

  it('retraso válido: DELAYED, salida y llegada desplazadas, flight:updated tras el commit', async () => {
    const result = await useCase.execute(delay(90));
    expect(result).toMatchObject({
      status: 'DELAYED',
      departureAt: new Date(flight.departureAt.getTime() + 90 * MINUTE),
      arrivalAt: new Date(flight.arrivalAt.getTime() + 90 * MINUTE),
      scheduledDepartureAt: flight.scheduledDepartureAt,
    });
    expect(doubles.writeLock.acquired).toEqual([
      { flightId: flight.id, condition: 'notCancelled' },
    ]);
    expect(doubles.uow.commits).toBe(1);
    expect(doubles.publisher.published.map((event) => event.type)).toEqual([
      'FlightUpdated',
      'FlightStatsChanged',
    ]);
    expect(doubles.publisher.published[0]).toMatchObject({
      seq: 1,
      status: 'DELAYED',
      delayed: true,
      change: 'DELAYED',
    });
    expect(doubles.publisher.published[1]).toMatchObject({ change: 'DELAYED' });
    expect(doubles.eventLog.events).toEqual([
      expect.objectContaining({ type: 'FLIGHT_UPDATED', seatCode: null, seq: 1 }),
    ]);
  });

  it('una hora no posterior → INVALID_DELAY, rollback y nada publicado', async () => {
    await expect(useCase.execute(delay(0))).rejects.toMatchObject({ code: 'INVALID_DELAY' });
    expect(doubles.uow.rollbacks).toBe(1);
    expect(flights.flights.get(flight.id)?.status).toBe('SCHEDULED');
    expect(doubles.publisher.published).toEqual([]);
  });

  it('retrasar un vuelo SOLD_OUT conserva SOLD_OUT', async () => {
    setUp({ status: 'SOLD_OUT' });
    const result = await useCase.execute(delay(30));
    expect(result.status).toBe('SOLD_OUT');
    expect(doubles.publisher.published[0]).toMatchObject({
      status: 'SOLD_OUT',
      delayed: true,
      change: 'DELAYED',
    });
  });

  it('cancelar libera los bloqueos y publica SeatReleased con FLIGHT_CANCELLED', async () => {
    const expiresAt = new Date(doubles.clock.now().getTime() + 10 * MINUTE);
    seats.forceHold(flight.id, '12C', CLIENT, expiresAt);
    seats.forceHold(flight.id, '3A', CLIENT, expiresAt);
    const result = await useCase.execute(cancel());
    expect(result.status).toBe('CANCELLED');
    expect(seats.seat(flight.id, '12C').status).toBe('AVAILABLE');
    expect(seats.seat(flight.id, '3A').status).toBe('AVAILABLE');
    const published = doubles.publisher.published;
    expect(published.map((event) => event.type)).toEqual([
      'FlightUpdated',
      'SeatReleased',
      'SeatReleased',
      'FlightStatsChanged',
    ]);
    expect(published.slice(0, 3).map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(published[1]).toMatchObject({ seatCode: '3A', reason: 'FLIGHT_CANCELLED' });
    expect(published[3]).toMatchObject({ seq: 3, change: 'CANCELLED' });
  });

  it('un vuelo cancelado no admite cambios → FLIGHT_STATUS_CONFLICT', async () => {
    await useCase.execute(cancel());
    await expect(useCase.execute(cancel())).rejects.toMatchObject({
      code: 'FLIGHT_STATUS_CONFLICT',
    });
    await expect(useCase.execute(delay(60))).rejects.toMatchObject({
      code: 'FLIGHT_STATUS_CONFLICT',
    });
  });

  it('vuelo inexistente → FLIGHT_NOT_FOUND', async () => {
    await expect(
      useCase.execute({ flightId: 'missing', request: { status: 'CANCELLED' } }),
    ).rejects.toEqual(new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe'));
  });

  it('si el vuelo desaparece entre el lock y la lectura → FLIGHT_NOT_FOUND y rollback', async () => {
    flights.flights.delete(flight.id);
    await expect(useCase.execute(cancel())).rejects.toMatchObject({ code: 'FLIGHT_NOT_FOUND' });
    expect(doubles.uow.rollbacks).toBe(1);
    expect(doubles.publisher.published).toEqual([]);
  });

  it('publica solo después del commit', async () => {
    let publishedDuringTransaction = -1;
    const original = doubles.publisher.publish.bind(doubles.publisher);
    doubles.publisher.publish = (events) => {
      publishedDuringTransaction = doubles.uow.isActive ? 1 : 0;
      original(events);
    };
    await useCase.execute(cancel());
    expect(publishedDuringTransaction).toBe(0);
  });
});
