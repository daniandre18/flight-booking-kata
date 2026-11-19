import { ReleaseSeatUseCase } from '../../../src/seats/application/release-seat.use-case';
import { InMemorySeatStore } from '../../doubles/seats.doubles';
import {
  buildFlightWriteContext,
  type FlightWriteDoubles,
} from '../../doubles/shared-kernel.doubles';

const FLIGHT = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';
const CLIENT = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';
const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('ReleaseSeatUseCase', () => {
  let doubles: FlightWriteDoubles;
  let seats: InMemorySeatStore;
  let useCase: ReleaseSeatUseCase;

  beforeEach(() => {
    doubles = buildFlightWriteContext();
    seats = new InMemorySeatStore();
    seats.addFlight(FLIGHT);
    doubles.uow.enlist(seats);
    doubles.writeLock.setFlight(FLIGHT, {
      status: 'SCHEDULED',
      departureAt: new Date('2027-01-01'),
    });
    useCase = new ReleaseSeatUseCase(doubles.context, seats);
  });

  const inFuture = () => new Date(doubles.clock.now().getTime() + 60_000);
  const release = (clientId = CLIENT) =>
    useCase.execute({ flightId: FLIGHT, seatCode: '12C', clientId });

  it('libera el bloqueo propio y publica SeatReleased con MANUAL tras el commit', async () => {
    seats.forceHold(FLIGHT, '12C', CLIENT, inFuture());
    await release();
    expect(seats.seat(FLIGHT, '12C')).toMatchObject({ status: 'AVAILABLE', heldBy: null });
    expect(doubles.writeLock.acquired).toEqual([{ flightId: FLIGHT, condition: 'any' }]);
    expect(doubles.publisher.published).toEqual([
      expect.objectContaining({ type: 'SeatReleased', seatCode: '12C', reason: 'MANUAL', seq: 1 }),
    ]);
  });

  it('no libera el bloqueo de otro cliente: SEAT_NOT_HELD sin publicar', async () => {
    seats.forceHold(FLIGHT, '12C', OTHER, inFuture());
    await expect(release()).rejects.toMatchObject({ code: 'SEAT_NOT_HELD' });
    expect(seats.seat(FLIGHT, '12C').heldBy).toBe(OTHER);
    expect(doubles.publisher.published).toEqual([]);
  });

  it('un bloqueo propio ya vencido da SEAT_NOT_HELD', async () => {
    seats.forceHold(FLIGHT, '12C', CLIENT, new Date(doubles.clock.now().getTime() - 1));
    await expect(release()).rejects.toMatchObject({ code: 'SEAT_NOT_HELD' });
  });
});
