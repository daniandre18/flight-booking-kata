import {
  assignBookedSeats,
  passengerSeatPositions,
} from '../../../src/bookings/domain/booking-policy';

const PASSENGERS = [
  { seatId: '12C', name: 'Ana Gómez' },
  { seatId: '12D', name: 'Luis Pérez' },
];
const BOOKED = [
  { id: 'seat-12d', row: 12, letter: 'D' as const },
  { id: 'seat-12c', row: 12, letter: 'C' as const },
];

describe('política de confirmación', () => {
  it('convierte los códigos de asiento en posiciones', () => {
    expect(passengerSeatPositions(PASSENGERS)).toEqual([
      { row: 12, letter: 'C' },
      { row: 12, letter: 'D' },
    ]);
  });

  it('un código de asiento inválido da VALIDATION_ERROR', () => {
    expect(() => passengerSeatPositions([{ seatId: '99Z', name: 'Ana Gómez' }])).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('asigna a cada pasajero su asiento confirmado', () => {
    expect(assignBookedSeats(PASSENGERS, { booked: BOOKED, remainingActiveHolds: 0 })).toEqual([
      { seatId: 'seat-12c', row: 12, letter: 'C', name: 'Ana Gómez' },
      { seatId: 'seat-12d', row: 12, letter: 'D', name: 'Luis Pérez' },
    ]);
  });

  it('si falta un asiento confirmado, el bloqueo venció: HOLD_EXPIRED', () => {
    const write = { booked: BOOKED.slice(0, 1), remainingActiveHolds: 0 };
    expect(() => assignBookedSeats(PASSENGERS, write)).toThrow(
      expect.objectContaining({ code: 'HOLD_EXPIRED' }),
    );
  });

  it('si quedan otros bloqueos vigentes del cliente: PASSENGERS_MISMATCH', () => {
    const write = { booked: BOOKED, remainingActiveHolds: 1 };
    expect(() => assignBookedSeats(PASSENGERS, write)).toThrow(
      expect.objectContaining({ code: 'PASSENGERS_MISMATCH', details: { remainingHolds: 1 } }),
    );
  });
});
