import {
  FlightRoomPayloadSchema,
  FlightStatsEventSchema,
  FlightUpdatedEventSchema,
  RealtimeEvents,
  SeatBookedEventSchema,
  SeatHeldEventSchema,
  SeatReleasedEventSchema,
  flightRoom,
} from '../src/index';

const base = {
  flightId: '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10',
  seq: 42,
  occurredAt: '2026-11-19T14:03:11.204Z',
};

describe('eventos de tiempo real', () => {
  it('seat:held exige holderTag y nunca acepta un clientId', () => {
    const event = {
      ...base,
      seatId: '12C',
      status: 'HELD',
      holdExpiresAt: base.occurredAt,
      holderTag: '9f86d081884c7d65',
    };
    expect(SeatHeldEventSchema.safeParse(event).success).toBe(true);
    expect(
      SeatHeldEventSchema.safeParse({ ...event, holderTag: '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192' })
        .success,
    ).toBe(false);
  });

  it('seat:released y seat:booked fijan el estado nuevo', () => {
    expect(
      SeatReleasedEventSchema.safeParse({
        ...base,
        seatId: '12C',
        status: 'AVAILABLE',
        reason: 'EXPIRED',
      }).success,
    ).toBe(true);
    expect(
      SeatReleasedEventSchema.safeParse({
        ...base,
        seatId: '12C',
        status: 'HELD',
        reason: 'EXPIRED',
      }).success,
    ).toBe(false);
    expect(
      SeatBookedEventSchema.safeParse({ ...base, seatId: '12C', status: 'BOOKED' }).success,
    ).toBe(true);
  });

  it('flight:updated y flight:stats llevan el resumen del vuelo', () => {
    const times = { departureAt: base.occurredAt, arrivalAt: base.occurredAt, delayed: true };
    expect(
      FlightUpdatedEventSchema.safeParse({
        ...base,
        ...times,
        status: 'DELAYED',
        scheduledDepartureAt: base.occurredAt,
        change: 'DELAYED',
      }).success,
    ).toBe(true);
    const stats = { available: 170, held: 2, booked: 8, total: 180 };
    expect(
      FlightStatsEventSchema.safeParse({
        ...base,
        ...times,
        status: 'DELAYED',
        availableSeats: 170,
        stats,
      }).success,
    ).toBe(true);
    expect(
      FlightStatsEventSchema.safeParse({
        ...base,
        ...times,
        status: 'DELAYED',
        availableSeats: -1,
        stats,
      }).success,
    ).toBe(false);
  });

  it('valida el payload de los rooms y nombra los eventos', () => {
    expect(FlightRoomPayloadSchema.safeParse({ flightId: base.flightId }).success).toBe(true);
    expect(FlightRoomPayloadSchema.safeParse({ flightId: 'room-ajeno' }).success).toBe(false);
    expect(flightRoom(base.flightId)).toBe(`flight:${base.flightId}`);
    expect(RealtimeEvents.SeatHeld).toBe('seat:held');
  });
});
