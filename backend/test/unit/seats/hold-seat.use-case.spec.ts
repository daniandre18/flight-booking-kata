import { HoldSeatUseCase } from '../../../src/seats/application/hold-seat.use-case';
import { holderTagOf } from '../../../src/shared-kernel/domain/holder-tag';
import { InMemorySeatStore } from '../../doubles/seats.doubles';
import {
  buildFlightWriteContext,
  type FlightWriteDoubles,
} from '../../doubles/shared-kernel.doubles';

const FLIGHT = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';
const CLIENT = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';
const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const TTL = 600;

describe('HoldSeatUseCase', () => {
  let doubles: FlightWriteDoubles;
  let seats: InMemorySeatStore;
  let useCase: HoldSeatUseCase;

  beforeEach(() => {
    doubles = buildFlightWriteContext();
    seats = new InMemorySeatStore();
    seats.addFlight(FLIGHT);
    doubles.uow.enlist(seats);
    const departureAt = new Date(doubles.clock.now().getTime() + 86_400_000);
    doubles.writeLock.setFlight(FLIGHT, { status: 'SCHEDULED', departureAt });
    doubles.statsReader.summaries.set(FLIGHT, {
      flightId: FLIGHT,
      status: 'SCHEDULED',
      scheduledDepartureAt: departureAt,
      departureAt,
      arrivalAt: departureAt,
      delayed: false,
      counts: { available: 179, held: 1, booked: 0, total: 180 },
    });
    useCase = new HoldSeatUseCase(doubles.context, seats, { holdTtlSeconds: TTL });
  });

  const hold = (seatCode: string, clientId = CLIENT) =>
    useCase.execute({ flightId: FLIGHT, seatCode, clientId });
  const codeOf = (promise: Promise<unknown>) =>
    promise.catch((error: { code: string }) => error.code);

  it('bloquea un asiento disponible con vencimiento now + ttl, holderTag y seq', async () => {
    const result = await hold('12C');
    expect(result).toMatchObject({ seatCode: '12C', holderTag: holderTagOf(CLIENT), seq: 1 });
    expect(result.holdExpiresAt.getTime() - doubles.clock.now().getTime()).toBe(TTL * 1_000);
    expect(seats.seat(FLIGHT, '12C')).toMatchObject({ status: 'HELD', heldBy: CLIENT });
    expect(doubles.writeLock.acquired).toEqual([{ flightId: FLIGHT, condition: 'bookable' }]);
    expect(doubles.eventLog.events.map((event) => event.type)).toEqual(['SEAT_HELD']);
  });

  it('publica SeatHeld y FlightStatsChanged solo después del commit', async () => {
    const publish = jest.spyOn(doubles.publisher, 'publish').mockImplementation((events) => {
      expect(doubles.uow.isActive).toBe(false);
      doubles.publisher.published.push(...events);
    });
    await hold('12C');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(doubles.publisher.published.map((event) => event.type)).toEqual([
      'SeatHeld',
      'FlightStatsChanged',
    ]);
    expect(JSON.stringify(doubles.publisher.published)).not.toContain(CLIENT);
  });

  it('el segundo asiento vence a la misma hora que el primero (reloj compartido)', async () => {
    const first = await hold('12C');
    doubles.clock.advance(60_000);
    const second = await hold('12D');
    expect(second.holdExpiresAt).toEqual(first.holdExpiresAt);
  });

  it('rechaza el quinto bloqueo con HOLD_LIMIT_REACHED y no escribe nada', async () => {
    for (const seat of ['1A', '1B', '1C', '1D']) {
      await hold(seat);
    }
    await expect(codeOf(hold('1E'))).resolves.toBe('HOLD_LIMIT_REACHED');
    expect(seats.seat(FLIGHT, '1E').status).toBe('AVAILABLE');
    expect(doubles.eventLog.events).toHaveLength(4);
  });

  it('un asiento de otro cliente da SEAT_UNAVAILABLE, hace rollback y no publica', async () => {
    seats.forceHold(FLIGHT, '12C', OTHER, new Date(doubles.clock.now().getTime() + 60_000));
    await expect(codeOf(hold('12C'))).resolves.toBe('SEAT_UNAVAILABLE');
    expect(doubles.uow.rollbacks).toBe(1);
    expect(doubles.eventLog.events).toEqual([]);
    expect(doubles.publisher.published).toEqual([]);
  });

  it('toma un bloqueo vencido de otro cliente (vista perezosa)', async () => {
    seats.forceHold(FLIGHT, '12C', OTHER, new Date(doubles.clock.now().getTime() - 1));
    await expect(hold('12C')).resolves.toMatchObject({ seatCode: '12C' });
    expect(seats.seat(FLIGHT, '12C').heldBy).toBe(CLIENT);
  });

  it('un vuelo que no admite bloqueos da FLIGHT_NOT_BOOKABLE sin tocar asientos', async () => {
    doubles.writeLock.setFlight(FLIGHT, {
      status: 'CANCELLED',
      departureAt: new Date('2027-01-01'),
    });
    await expect(codeOf(hold('12C'))).resolves.toBe('FLIGHT_NOT_BOOKABLE');
    expect(seats.seat(FLIGHT, '12C').status).toBe('AVAILABLE');
  });

  it('un código de asiento inválido da SEAT_NOT_FOUND', async () => {
    await expect(codeOf(hold('31Z'))).resolves.toBe('SEAT_NOT_FOUND');
  });

  it('si no hay resumen del vuelo publica solo el evento del asiento', async () => {
    doubles.statsReader.summaries.clear();
    await hold('12C');
    expect(doubles.publisher.published.map((event) => event.type)).toEqual(['SeatHeld']);
  });
});
