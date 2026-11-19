import { formatSeatCode, seatTypeOf, type BookingDto } from '@kata/shared';
import { toFlightDto } from '../../flights';
import type { BookingView } from './booking-view';

/** Única traducción BookingView → BookingDto. Solo expone marca y últimos 4 de la tarjeta. */
export function toBookingDto(view: BookingView): BookingDto {
  const { booking } = view;
  return {
    code: booking.code,
    flight: toFlightDto(view.flight),
    buyer: { name: booking.buyerName, email: booking.buyerEmail },
    passengers: booking.passengers.map((passenger) => ({
      seatId: formatSeatCode(passenger.row, passenger.letter),
      name: passenger.name,
      type: seatTypeOf(passenger.letter),
    })),
    total: booking.total,
    cardBrand: booking.cardBrand,
    cardLast4: booking.cardLast4,
    createdAt: booking.createdAt.toISOString(),
  };
}
