import { Injectable } from '@nestjs/common';
import type { SeatLetter } from '@kata/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaUnitOfWork } from '../../../shared-kernel/infrastructure/persistence/prisma-unit-of-work';
import { isUuid } from '../../../shared-kernel/infrastructure/persistence/uuid';
import type { BookingLookupPort, BookingRecord } from '../../application/ports/booking-lookup.port';

const WITH_SEATS = {
  seats: { include: { seat: { select: { row: true, letter: true } } } },
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof WITH_SEATS }>;

/** Lectura de reservas; la ausencia y el correo incorrecto son indistinguibles (RF-021). */
@Injectable()
export class PrismaBookingLookup implements BookingLookupPort {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  findByCodeAndEmail(code: string, email: string): Promise<BookingRecord | null> {
    return this.find({ code: code.trim().toUpperCase(), buyerEmail: email.trim().toLowerCase() });
  }

  findById(bookingId: string): Promise<BookingRecord | null> {
    return isUuid(bookingId) ? this.find({ id: bookingId }) : Promise.resolve(null);
  }

  private async find(where: Prisma.BookingWhereInput): Promise<BookingRecord | null> {
    const row = await this.uow.currentTx().booking.findFirst({ where, include: WITH_SEATS });
    return row === null ? null : toRecord(row);
  }
}

function toRecord(row: BookingRow): BookingRecord {
  const passengers = row.seats
    .map((bookingSeat) => ({
      row: bookingSeat.seat.row,
      letter: bookingSeat.seat.letter as SeatLetter,
      name: bookingSeat.passengerName,
    }))
    .sort((a, b) => a.row - b.row || a.letter.localeCompare(b.letter));
  return {
    id: row.id,
    code: row.code,
    flightId: row.flightId,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
    total: row.total,
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    createdAt: row.createdAt,
    passengers,
  };
}
