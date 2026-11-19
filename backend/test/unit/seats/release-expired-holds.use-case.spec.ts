import { ReleaseExpiredHoldsUseCase } from '../../../src/seats/application/release-expired-holds.use-case';
import { InMemorySeatStore } from '../../doubles/seats.doubles';
import {
  buildFlightWriteContext,
  type FlightWriteDoubles,
} from '../../doubles/shared-kernel.doubles';

const FLIGHT_A = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';
const FLIGHT_B = '9d1f3a2b-6c4e-4a8f-b2d1-7e5c3f9a1b20';
const CLIENT = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';

describe('ReleaseExpiredHoldsUseCase', () => {
  let doubles: FlightWriteDoubles;
  let seats: InMemorySeatStore;
  let useCase: ReleaseExpiredHoldsUseCase;
  let expiresAt: Date;

  beforeEach(() => {
    doubles = buildFlightWriteContext();
    seats = new InMemorySeatStore();
    doubles.uow.enlist(seats);
    const departureAt = new Date(doubles.clock.now().getTime() + 86_400_000);
    for (const flightId of [FLIGHT_A, FLIGHT_B]) {
      seats.addFlight(flightId);
      doubles.writeLock.setFlight(flightId, { status: 'SCHEDULED', departureAt });
      doubles.statsReader.summaries.set(flightId, {
        flightId,
        status: 'SCHEDULED',
        scheduledDepartureAt: departureAt,
        departureAt,
        arrivalAt: departureAt,
        delayed: false,
        counts: { available: 180, held: 0, booked: 0, total: 180 },
      });
    }
    expiresAt = new Date(doubles.clock.now().getTime() + 600_000);
    useCase = new ReleaseExpiredHoldsUseCase(doubles.context, seats);
  });

  it('no hace nada si no hay bloqueos vencidos', async () => {
    seats.forceHold(FLIGHT_A, '12C', CLIENT, expiresAt);
    await expect(useCase.execute()).resolves.toEqual({ released: 0, failures: [] });
    expect(seats.seat(FLIGHT_A, '12C').status).toBe('HELD');
    expect(doubles.publisher.published).toEqual([]);
  });

  it('libera los vencidos por vuelo con seq consecutivas y lock `any`', async () => {
    seats.forceHold(FLIGHT_A, '12C', CLIENT, expiresAt);
    seats.forceHold(FLIGHT_A, '12D', CLIENT, expiresAt);
    seats.forceHold(FLIGHT_B, '3A', CLIENT, expiresAt);
    doubles.clock.advance(600_000);
    await expect(useCase.execute()).resolves.toEqual({ released: 3, failures: [] });
    expect(seats.seat(FLIGHT_A, '12C')).toMatchObject({ status: 'AVAILABLE', heldBy: null });
    expect(seats.seat(FLIGHT_B, '3A').status).toBe('AVAILABLE');
    expect(doubles.writeLock.acquired).toEqual([
      { flightId: FLIGHT_A, condition: 'any' },
      { flightId: FLIGHT_B, condition: 'any' },
    ]);
    const flightA = doubles.eventLog.events.filter((event) => event.flightId === FLIGHT_A);
    expect(flightA.map((event) => [event.seatCode, event.seq, event.payload.reason])).toEqual([
      ['12C', 1, 'EXPIRED'],
      ['12D', 2, 'EXPIRED'],
    ]);
  });

  it('publica SeatReleased con EXPIRED y FlightStatsChanged solo tras cada commit', async () => {
    jest.spyOn(doubles.publisher, 'publish').mockImplementation((events) => {
      expect(doubles.uow.isActive).toBe(false);
      doubles.publisher.published.push(...events);
    });
    seats.forceHold(FLIGHT_A, '12C', CLIENT, expiresAt);
    doubles.clock.advance(601_000);
    await useCase.execute();
    expect(doubles.publisher.published).toEqual([
      expect.objectContaining({ type: 'SeatReleased', seatCode: '12C', reason: 'EXPIRED', seq: 1 }),
      expect.objectContaining({ type: 'FlightStatsChanged', flightId: FLIGHT_A, seq: 1 }),
    ]);
    expect(JSON.stringify(doubles.publisher.published)).not.toContain(CLIENT);
  });

  it('el fallo de un vuelo no detiene a los demás y queda informado', async () => {
    seats.forceHold(FLIGHT_A, '12C', CLIENT, expiresAt);
    seats.forceHold(FLIGHT_B, '3A', CLIENT, expiresAt);
    doubles.writeLock.flights.delete(FLIGHT_A);
    doubles.clock.advance(601_000);
    const result = await useCase.execute();
    expect(result.released).toBe(1);
    expect(result.failures).toEqual([
      { flightId: FLIGHT_A, error: expect.objectContaining({ code: 'FLIGHT_NOT_FOUND' }) },
    ]);
    expect(seats.seat(FLIGHT_A, '12C').status).toBe('HELD');
    expect(seats.seat(FLIGHT_B, '3A').status).toBe('AVAILABLE');
  });

  it('si otra operación ya liberó los asientos no registra ni publica nada', async () => {
    seats.forceHold(FLIGHT_A, '12C', CLIENT, expiresAt);
    doubles.clock.advance(601_000);
    jest.spyOn(seats, 'releaseExpired').mockResolvedValueOnce([]);
    await expect(useCase.execute()).resolves.toEqual({ released: 0, failures: [] });
    expect(doubles.eventLog.events).toEqual([]);
    expect(doubles.publisher.published).toEqual([]);
  });
});
