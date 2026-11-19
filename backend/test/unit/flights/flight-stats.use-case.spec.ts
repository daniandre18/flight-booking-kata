import { GetFlightEventsUseCase } from '../../../src/flights/application/get-flight-events.use-case';
import { GetFlightStatsUseCase } from '../../../src/flights/application/get-flight-stats.use-case';
import type { RecordedFlightEvent } from '../../../src/shared-kernel/application/flight-event-log.port';
import { InMemoryFlightQuery, sampleFlightView } from '../../doubles/flights.doubles';
import {
  InMemoryFlightEventQuery,
  buildFlightWriteContext,
} from '../../doubles/shared-kernel.doubles';

const FLIGHT = sampleFlightView();

describe('Tablero: estadísticas y registro de actividad', () => {
  describe('GetFlightStatsUseCase', () => {
    it('suma el total y calcula la ocupación (reservados ÷ total) con un decimal', async () => {
      const doubles = buildFlightWriteContext();
      doubles.statsReader.summaries.set(FLIGHT.id, {
        flightId: FLIGHT.id,
        status: 'SCHEDULED',
        scheduledDepartureAt: FLIGHT.departureAt,
        departureAt: FLIGHT.departureAt,
        arrivalAt: FLIGHT.arrivalAt,
        delayed: false,
        counts: { available: 150, held: 4, booked: 26, total: 180 },
      });
      const stats = await new GetFlightStatsUseCase(doubles.statsReader, doubles.clock).execute(
        FLIGHT.id,
      );
      expect(stats).toEqual({
        flightId: FLIGHT.id,
        seq: 0,
        available: 150,
        held: 4,
        booked: 26,
        total: 180,
        occupancyPercent: 14.4,
      });
    });

    it('un vuelo sin asientos da 0 % y un vuelo inexistente → FLIGHT_NOT_FOUND', async () => {
      const doubles = buildFlightWriteContext();
      doubles.statsReader.summaries.set(FLIGHT.id, {
        flightId: FLIGHT.id,
        status: 'SCHEDULED',
        scheduledDepartureAt: FLIGHT.departureAt,
        departureAt: FLIGHT.departureAt,
        arrivalAt: FLIGHT.arrivalAt,
        delayed: false,
        counts: { available: 0, held: 0, booked: 0, total: 0 },
      });
      const useCase = new GetFlightStatsUseCase(doubles.statsReader, doubles.clock);
      await expect(useCase.execute(FLIGHT.id)).resolves.toMatchObject({ occupancyPercent: 0 });
      await expect(useCase.execute('missing')).rejects.toMatchObject({ code: 'FLIGHT_NOT_FOUND' });
    });
  });

  describe('GetFlightEventsUseCase', () => {
    const at = new Date('2026-11-18T15:00:00.000Z');
    const event = (
      seq: number,
      overrides: Partial<RecordedFlightEvent> = {},
    ): RecordedFlightEvent => ({
      flightId: FLIGHT.id,
      seq,
      type: 'SEAT_HELD',
      seatCode: '12C',
      payload: { seatId: '12C', status: 'HELD' },
      occurredAt: at,
      ...overrides,
    });

    it('devuelve los más recientes primero con tipo, asiento, estado y motivo', async () => {
      const flights = new InMemoryFlightQuery();
      flights.add(FLIGHT);
      const events = new InMemoryFlightEventQuery();
      events.events.push(
        event(1),
        event(2, {
          type: 'SEAT_RELEASED',
          payload: { seatId: '12C', status: 'AVAILABLE', reason: 'EXPIRED' },
        }),
        event(3, {
          type: 'FLIGHT_UPDATED',
          seatCode: null,
          payload: { status: 'DELAYED', change: 'DELAYED' },
        }),
      );
      const clock = buildFlightWriteContext().clock;
      const result = await new GetFlightEventsUseCase(flights, events, clock).execute(
        FLIGHT.id,
        50,
      );
      expect(result).toEqual([
        { seq: 3, type: 'FLIGHT_UPDATED', seatId: null, status: 'DELAYED', occurredAt: at },
        {
          seq: 2,
          type: 'SEAT_RELEASED',
          seatId: '12C',
          status: 'AVAILABLE',
          reason: 'EXPIRED',
          occurredAt: at,
        },
        { seq: 1, type: 'SEAT_HELD', seatId: '12C', status: 'HELD', occurredAt: at },
      ]);
    });

    it('respeta el límite (máximo 50 por defecto) y un vuelo inexistente → 404', async () => {
      const flights = new InMemoryFlightQuery();
      flights.add(FLIGHT);
      const events = new InMemoryFlightEventQuery();
      for (let seq = 1; seq <= 60; seq += 1) {
        events.events.push(event(seq));
      }
      const clock = buildFlightWriteContext().clock;
      const useCase = new GetFlightEventsUseCase(flights, events, clock);
      const result = await useCase.execute(FLIGHT.id);
      expect(result).toHaveLength(50);
      expect(result[0]?.seq).toBe(60);
      await expect(useCase.execute(FLIGHT.id, 5)).resolves.toHaveLength(5);
      await expect(useCase.execute('missing')).rejects.toMatchObject({ code: 'FLIGHT_NOT_FOUND' });
    });
  });
});
