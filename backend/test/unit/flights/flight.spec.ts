import {
  cancelFlight,
  delayFlight,
  durationMinutes,
  isBookable,
  isDelayed,
  type FlightSchedule,
} from '../../../src/flights/domain/flight';
import { DomainError } from '../../../src/shared-kernel/domain/domain-error';

const DEPARTURE = new Date('2026-11-19T15:00:00.000Z');
const ARRIVAL = new Date('2026-11-19T16:05:00.000Z');

function schedule(overrides: Partial<FlightSchedule> = {}): FlightSchedule {
  return {
    status: 'SCHEDULED',
    scheduledDepartureAt: DEPARTURE,
    departureAt: DEPARTURE,
    arrivalAt: ARRIVAL,
    ...overrides,
  };
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'OTHER';
  }
  return undefined;
}

describe('Flight (dominio)', () => {
  it('calcula la duración en minutos y el retraso derivado', () => {
    expect(durationMinutes(DEPARTURE, ARRIVAL)).toBe(65);
    expect(isDelayed(DEPARTURE, DEPARTURE)).toBe(false);
    expect(isDelayed(DEPARTURE, new Date(DEPARTURE.getTime() + 1))).toBe(true);
  });

  describe('isBookable', () => {
    const before = new Date(DEPARTURE.getTime() - 1);

    it('admite SCHEDULED y DELAYED antes de la salida', () => {
      expect(isBookable(schedule(), before)).toBe(true);
      expect(isBookable(schedule({ status: 'DELAYED' }), before)).toBe(true);
    });

    it('rechaza CANCELLED, SOLD_OUT y vuelos que ya salieron', () => {
      expect(isBookable(schedule({ status: 'CANCELLED' }), before)).toBe(false);
      expect(isBookable(schedule({ status: 'SOLD_OUT' }), before)).toBe(false);
      expect(isBookable(schedule(), DEPARTURE)).toBe(false);
    });
  });

  describe('delayFlight', () => {
    const later = new Date(DEPARTURE.getTime() + 90 * 60_000);

    it('pasa a DELAYED y desplaza salida y llegada lo mismo, sin tocar la programada', () => {
      expect(delayFlight(schedule(), later)).toEqual({
        status: 'DELAYED',
        scheduledDepartureAt: DEPARTURE,
        departureAt: later,
        arrivalAt: new Date(ARRIVAL.getTime() + 90 * 60_000),
      });
    });

    it('un vuelo DELAYED se puede retrasar de nuevo', () => {
      const delayed = delayFlight(schedule(), later);
      const again = delayFlight(delayed, new Date(later.getTime() + 60_000));
      expect(again.status).toBe('DELAYED');
      expect(again.scheduledDepartureAt).toEqual(DEPARTURE);
    });

    it('SOLD_OUT conserva su estado al retrasarse', () => {
      expect(delayFlight(schedule({ status: 'SOLD_OUT' }), later).status).toBe('SOLD_OUT');
    });

    it('una hora no posterior a la salida vigente → INVALID_DELAY', () => {
      expect(codeOf(() => delayFlight(schedule(), DEPARTURE))).toBe('INVALID_DELAY');
      expect(codeOf(() => delayFlight(schedule(), new Date(DEPARTURE.getTime() - 1)))).toBe(
        'INVALID_DELAY',
      );
    });

    it('un vuelo cancelado no admite cambios → FLIGHT_STATUS_CONFLICT', () => {
      expect(codeOf(() => delayFlight(schedule({ status: 'CANCELLED' }), later))).toBe(
        'FLIGHT_STATUS_CONFLICT',
      );
    });
  });

  describe('cancelFlight', () => {
    it('cancela desde SCHEDULED, DELAYED y SOLD_OUT conservando las horas', () => {
      for (const status of ['SCHEDULED', 'DELAYED', 'SOLD_OUT'] as const) {
        expect(cancelFlight(schedule({ status }))).toEqual(schedule({ status: 'CANCELLED' }));
      }
    });

    it('cancelar dos veces → FLIGHT_STATUS_CONFLICT', () => {
      expect(codeOf(() => cancelFlight(schedule({ status: 'CANCELLED' })))).toBe(
        'FLIGHT_STATUS_CONFLICT',
      );
    });
  });
});
