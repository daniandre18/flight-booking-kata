import { GetFlightUseCase } from '../../../src/flights/application/get-flight.use-case';
import { SearchFlightsUseCase } from '../../../src/flights/application/search-flights.use-case';
import { DomainError } from '../../../src/shared-kernel/domain/domain-error';
import { InMemoryFlightQuery, sampleFlightView } from '../../doubles/flights.doubles';
import { FakeClock } from '../../support/fake-clock';

const at = (iso: string): Date => new Date(iso);

describe('Consultas de vuelos', () => {
  let flights: InMemoryFlightQuery;
  let clock: FakeClock;

  beforeEach(() => {
    flights = new InMemoryFlightQuery();
    clock = new FakeClock();
  });

  describe('SearchFlightsUseCase', () => {
    it('busca en el día de Bogotá y devuelve los vuelos ordenados por salida', async () => {
      const morning = sampleFlightView({ id: 'a', departureAt: at('2026-11-19T11:00:00Z') });
      const night = sampleFlightView({ id: 'b', departureAt: at('2026-11-20T04:30:00Z') });
      const noon = sampleFlightView({ id: 'c', departureAt: at('2026-11-19T17:00:00Z') });
      const nextDay = sampleFlightView({ id: 'd', departureAt: at('2026-11-20T05:00:00Z') });
      const otherRoute = sampleFlightView({ id: 'e', destination: 'CLO' });
      [night, morning, nextDay, noon, otherRoute].forEach((flight) => flights.add(flight));

      const result = await new SearchFlightsUseCase(flights, clock).execute({
        origin: 'BOG',
        destination: 'MDE',
        date: '2026-11-19',
      });

      expect(result.map((flight) => flight.id)).toEqual(['a', 'c', 'b']);
      expect(flights.searches).toEqual([
        {
          origin: 'BOG',
          destination: 'MDE',
          departureFrom: at('2026-11-19T05:00:00Z'),
          departureTo: at('2026-11-20T05:00:00Z'),
          now: clock.now(),
        },
      ]);
    });

    it('sin resultados devuelve una lista vacía', async () => {
      const result = await new SearchFlightsUseCase(flights, clock).execute({
        origin: 'CTG',
        destination: 'BAQ',
        date: '2026-11-21',
      });
      expect(result).toEqual([]);
    });
  });

  describe('GetFlightUseCase', () => {
    it('devuelve el vuelo con su seq', async () => {
      flights.add(sampleFlightView({ seq: 7 }));
      const flight = await new GetFlightUseCase(flights, clock).execute(sampleFlightView().id);
      expect(flight.seq).toBe(7);
    });

    it('si no existe lanza FLIGHT_NOT_FOUND', async () => {
      await expect(new GetFlightUseCase(flights, clock).execute('missing')).rejects.toEqual(
        new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe'),
      );
    });
  });
});
