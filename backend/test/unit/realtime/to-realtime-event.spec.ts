import {
  FlightStatsEventSchema,
  FlightUpdatedEventSchema,
  SeatBookedEventSchema,
  SeatHeldEventSchema,
  SeatReleasedEventSchema,
} from '@kata/shared';
import { toRealtimeMessage } from '../../../src/realtime/application/to-realtime-event';
import type { DomainEvent } from '../../../src/shared-kernel/application/event-publisher';
import { holderTagOf } from '../../../src/shared-kernel/domain/holder-tag';

const FLIGHT = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';
const CLIENT = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';
const occurredAt = new Date('2026-11-19T14:03:11.204Z');
const departureAt = new Date('2026-11-19T20:00:00.000Z');
const arrivalAt = new Date('2026-11-19T21:00:00.000Z');
const base = { flightId: FLIGHT, occurredAt };

const summary = {
  flightId: FLIGHT,
  seq: 43,
  status: 'SCHEDULED' as const,
  scheduledDepartureAt: departureAt,
  departureAt,
  arrivalAt,
  delayed: false,
  counts: { available: 170, held: 2, booked: 8, total: 180 },
};

const CASES: [DomainEvent, string, string, { parse: (value: unknown) => unknown }][] = [
  [
    {
      ...base,
      type: 'SeatHeld',
      seq: 42,
      seatCode: '12C',
      holdExpiresAt: new Date('2026-11-19T14:13:11.204Z'),
      holderTag: holderTagOf(CLIENT),
    },
    `flight:${FLIGHT}`,
    'seat:held',
    SeatHeldEventSchema,
  ],
  [
    { ...base, type: 'SeatReleased', seq: 43, seatCode: '12C', reason: 'EXPIRED' },
    `flight:${FLIGHT}`,
    'seat:released',
    SeatReleasedEventSchema,
  ],
  [
    { ...base, type: 'SeatBooked', seq: 44, seatCode: '12C' },
    `flight:${FLIGHT}`,
    'seat:booked',
    SeatBookedEventSchema,
  ],
  [
    {
      ...base,
      type: 'FlightUpdated',
      seq: 45,
      status: 'SOLD_OUT',
      scheduledDepartureAt: departureAt,
      departureAt,
      arrivalAt,
      delayed: false,
      change: 'SOLD_OUT',
    },
    `flight:${FLIGHT}`,
    'flight:updated',
    FlightUpdatedEventSchema,
  ],
  [
    { ...base, type: 'FlightStatsChanged', seq: 43, summary },
    'search',
    'flight:stats',
    FlightStatsEventSchema,
  ],
];

describe('toRealtimeMessage', () => {
  it.each(CASES)(
    'traduce %# al room y evento del contrato con un payload válido',
    (event, room, name, schema) => {
      const message = toRealtimeMessage(event);
      expect(message.room).toBe(room);
      expect(message.event).toBe(name);
      expect(() => schema.parse(message.payload)).not.toThrow();
      expect(message.payload).toMatchObject({
        flightId: FLIGHT,
        seq: event.seq,
        occurredAt: occurredAt.toISOString(),
      });
    },
  );

  it('ningún payload contiene el clientId; el dueño viaja como holderTag', () => {
    const payloads = CASES.map(([event]) => toRealtimeMessage(event).payload);
    expect(JSON.stringify(payloads)).not.toContain(CLIENT);
    expect(payloads[0]).toMatchObject({
      seatId: '12C',
      status: 'HELD',
      holderTag: holderTagOf(CLIENT),
    });
  });

  it('flight:stats lleva el resumen completo y el cambio de estado si lo hubo', () => {
    const message = toRealtimeMessage({
      ...base,
      type: 'FlightStatsChanged',
      seq: 46,
      summary: { ...summary, status: 'SOLD_OUT' },
      change: 'SOLD_OUT',
    });
    expect(message.payload).toMatchObject({
      status: 'SOLD_OUT',
      availableSeats: 170,
      stats: { available: 170, held: 2, booked: 8, total: 180 },
      change: 'SOLD_OUT',
    });
  });

  it('un evento que no cumple el contrato falla en el servidor', () => {
    const invalid = { ...base, type: 'SeatBooked', seq: 1, seatCode: '99Z' } as DomainEvent;
    expect(() => toRealtimeMessage(invalid)).toThrow();
  });
});
