import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import type {
  BookingStore,
  NewBooking,
  SavedBooking,
} from '../../application/ports/booking-store.port';

/**
 * Escribe solo tablas del módulo: `bookings` y `booking_seats` (`UNIQUE(seat_id)` como última
 * defensa). De la tarjeta guarda marca y últimos 4 dígitos (principio X).
 */
@Injectable()
export class PrismaBookingStore implements BookingStore {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async save(booking: NewBooking, code: string): Promise<SavedBooking | null> {
    const tx = this.uow.requireTx();
    // ON CONFLICT DO NOTHING: una colisión del código no aborta la transacción.
    const [created] = await tx.booking.createManyAndReturn({
      data: [
        {
          code,
          flightId: booking.flightId,
          clientId: booking.clientId,
          buyerName: booking.buyerName,
          buyerEmail: booking.buyerEmail.toLowerCase(),
          total: booking.total,
          cardBrand: booking.cardBrand,
          cardLast4: booking.cardLast4,
          createdAt: booking.createdAt,
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    if (created === undefined) {
      return null;
    }
    await tx.bookingSeat.createMany({
      data: booking.passengers.map((passenger) => ({
        bookingId: created.id,
        seatId: passenger.seatId,
        passengerName: passenger.name,
      })),
    });
    return { id: created.id, code };
  }
}
