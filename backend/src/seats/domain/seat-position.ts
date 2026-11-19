import { parseSeatCode, type SeatPosition } from '@kata/shared';
import { DomainError } from '../../shared-kernel/domain/domain-error';

export function requireSeatPosition(seatCode: string): SeatPosition {
  const position = parseSeatCode(seatCode);
  if (position === null) {
    throw new DomainError('SEAT_NOT_FOUND', 'El asiento no existe');
  }
  return position;
}
