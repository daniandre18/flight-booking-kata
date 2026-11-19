import { formatSeatCode, parseSeatCode, type SeatPosition } from '@kata/shared';
import { DomainError } from '../../shared-kernel/domain/domain-error';

export interface PassengerRequest {
  /** Código del asiento (`12C`). */
  seatId: string;
  name: string;
}

/** Asiento que la base pasó a BOOKED; `id` es la clave de la fila de `seats`. */
export interface BookedSeatRef extends SeatPosition {
  id: string;
}

export interface BookedPassenger extends SeatPosition {
  seatId: string;
  name: string;
}

export interface BookingWrite {
  booked: readonly BookedSeatRef[];
  remainingActiveHolds: number;
}

export function passengerSeatPositions(passengers: readonly PassengerRequest[]): SeatPosition[] {
  return passengers.map((passenger) => {
    const position = parseSeatCode(passenger.seatId);
    if (position === null) {
      throw new DomainError('VALIDATION_ERROR', 'Hay datos inválidos', [
        { path: 'passengers.seatId', message: 'Código de asiento inválido' },
      ]);
    }
    return position;
  });
}

/**
 * Verificación posterior a la escritura (research.md §9, paso 4): cada pasajero debe tener su
 * asiento confirmado (si no, el bloqueo venció → 410) y el cliente no debe conservar otros
 * bloqueos vigentes en el vuelo (→ 422). Todo o nada: el error deshace la transacción.
 */
export function assignBookedSeats(
  passengers: readonly PassengerRequest[],
  write: BookingWrite,
): BookedPassenger[] {
  const bookedByCode = new Map(
    write.booked.map((seat) => [formatSeatCode(seat.row, seat.letter), seat]),
  );
  const assigned = passengers.map((passenger) => {
    const seat = bookedByCode.get(passenger.seatId);
    if (seat === undefined) {
      throw new DomainError(
        'HOLD_EXPIRED',
        'Tus bloqueos vencieron. Vuelve a elegir tus asientos.',
      );
    }
    return { seatId: seat.id, row: seat.row, letter: seat.letter, name: passenger.name };
  });
  if (write.remainingActiveHolds > 0) {
    throw new DomainError(
      'PASSENGERS_MISMATCH',
      'Indica un pasajero por cada asiento bloqueado o libera los que no quieras',
      { remainingHolds: write.remainingActiveHolds },
    );
  }
  return assigned;
}
