import { GetMyHoldsUseCase } from '../../../src/seats/application/get-my-holds.use-case';
import { GetSeatMapUseCase } from '../../../src/seats/application/get-seat-map.use-case';
import {
  toHoldSeatResponse,
  toMyHoldsResponse,
  toSeatMapSnapshot,
} from '../../../src/seats/application/seat-dto.mapper';
import { HoldSeatResponseSchema, MyHoldsResponseSchema, SeatMapSnapshotSchema } from '@kata/shared';
import { holderTagOf } from '../../../src/shared-kernel/domain/holder-tag';
import { InMemoryFlightQuery, sampleFlightView } from '../../doubles/flights.doubles';
import { InMemorySeatStore } from '../../doubles/seats.doubles';
import { InMemoryUnitOfWork } from '../../doubles/shared-kernel.doubles';
import { FakeClock } from '../../support/fake-clock';

const FLIGHT = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';
const CLIENT = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';

describe('consultas de asientos', () => {
  const clock = new FakeClock();
  let seats: InMemorySeatStore;
  let flights: InMemoryFlightQuery;

  beforeEach(() => {
    seats = new InMemorySeatStore();
    seats.addFlight(FLIGHT);
    flights = new InMemoryFlightQuery();
    flights.add(sampleFlightView({ id: FLIGHT, seq: 7 }));
  });

  describe('GetSeatMapUseCase', () => {
    const useCase = () => new GetSeatMapUseCase(new InMemoryUnitOfWork(), flights, seats, clock);

    it('devuelve vuelo, asientos y serverNow con la seq del vuelo', async () => {
      seats.forceHold(FLIGHT, '12C', CLIENT, new Date(clock.now().getTime() + 60_000));
      const snapshot = toSeatMapSnapshot(await useCase().execute(FLIGHT));
      expect(SeatMapSnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(snapshot.seq).toBe(7);
      expect(snapshot.seats).toHaveLength(180);
      expect(snapshot.seats.find((seat) => seat.seatId === '12C')).toMatchObject({
        status: 'HELD',
        type: 'AISLE',
        price: 210_000,
        holderTag: holderTagOf(CLIENT),
      });
    });

    it('muestra disponible un bloqueo vencido (vista perezosa)', async () => {
      seats.forceHold(FLIGHT, '12C', CLIENT, new Date(clock.now().getTime() - 1));
      const result = await useCase().execute(FLIGHT);
      expect(result.seats.find((seat) => seat.row === 12 && seat.letter === 'C')).toMatchObject({
        status: 'AVAILABLE',
        holderTag: null,
      });
    });

    it('un vuelo inexistente da FLIGHT_NOT_FOUND', async () => {
      await expect(useCase().execute('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject(
        {
          code: 'FLIGHT_NOT_FOUND',
        },
      );
    });
  });

  describe('GetMyHoldsUseCase', () => {
    it('agrupa los bloqueos vigentes por vuelo y devuelve el holderTag propio', async () => {
      const expiresAt = new Date(clock.now().getTime() + 60_000);
      seats.forceHold(FLIGHT, '12C', CLIENT, expiresAt);
      seats.forceHold(FLIGHT, '12D', CLIENT, expiresAt);
      seats.forceHold(FLIGHT, '1A', CLIENT, new Date(clock.now().getTime() - 1));
      const response = toMyHoldsResponse(await new GetMyHoldsUseCase(seats, clock).execute(CLIENT));
      expect(MyHoldsResponseSchema.safeParse(response).success).toBe(true);
      expect(response.holderTag).toBe(holderTagOf(CLIENT));
      expect(response.holds).toEqual([
        { flightId: FLIGHT, seatIds: ['12C', '12D'], holdExpiresAt: expiresAt.toISOString() },
      ]);
    });
  });

  it('toHoldSeatResponse cumple el contrato', () => {
    const response = toHoldSeatResponse({
      flightId: FLIGHT,
      seatCode: '12C',
      holdExpiresAt: clock.now(),
      holderTag: holderTagOf(CLIENT),
      seq: 1,
      serverNow: clock.now(),
    });
    expect(HoldSeatResponseSchema.safeParse(response).success).toBe(true);
  });
});
