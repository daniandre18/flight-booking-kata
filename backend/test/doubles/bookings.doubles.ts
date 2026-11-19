import {
  DECLINED_TEST_CARD,
  detectCardBrand,
  lastFourDigits,
  parseSeatCode,
  type CardBrand,
} from '@kata/shared';
import type {
  BookingLookupPort,
  BookingRecord,
} from '../../src/bookings/application/ports/booking-lookup.port';
import type {
  BookingStore,
  NewBooking,
  SavedBooking,
} from '../../src/bookings/application/ports/booking-store.port';
import type {
  IdempotencyKeyRef,
  IdempotencyStore,
  ReserveKeyResult,
} from '../../src/bookings/application/ports/idempotency-store.port';
import type {
  ChargeRequest,
  ChargeResult,
  PaymentGateway,
} from '../../src/bookings/application/ports/payment-gateway.port';
import type { FlightStatusPort } from '../../src/flights';
import type { Transactional } from './shared-kernel.doubles';

interface StoredKey {
  requestHash: string;
  bookingId: string | null;
}

/** Claves de idempotencia en memoria; participan en el rollback como en la base. */
export class InMemoryIdempotencyStore implements IdempotencyStore, Transactional {
  private keys = new Map<string, StoredKey>();

  get size(): number {
    return this.keys.size;
  }

  reserve(ref: IdempotencyKeyRef & { requestHash: string }): Promise<ReserveKeyResult> {
    const stored = this.keys.get(keyOf(ref));
    if (stored === undefined) {
      this.keys.set(keyOf(ref), { requestHash: ref.requestHash, bookingId: null });
      return Promise.resolve({ status: 'reserved' });
    }
    if (stored.bookingId === null) {
      return Promise.reject(new Error('Clave de idempotencia sin reserva asociada'));
    }
    return Promise.resolve({
      status: 'existing',
      requestHash: stored.requestHash,
      bookingId: stored.bookingId,
    });
  }

  attach(ref: IdempotencyKeyRef, bookingId: string): Promise<void> {
    const stored = this.keys.get(keyOf(ref));
    if (stored !== undefined) {
      stored.bookingId = bookingId;
    }
    return Promise.resolve();
  }

  snapshot(): unknown {
    return new Map([...this.keys].map(([id, value]) => [id, { ...value }]));
  }

  restore(state: unknown): void {
    this.keys = state as Map<string, StoredKey>;
  }
}

function keyOf(ref: IdempotencyKeyRef): string {
  return `${ref.clientId}:${ref.key}`;
}

/** Reservas en memoria: escritura (`BookingStore`) y lectura (`BookingLookupPort`). */
export class InMemoryBookingStore implements BookingStore, BookingLookupPort, Transactional {
  private records = new Map<string, BookingRecord>();
  private nextId = 1;

  get all(): BookingRecord[] {
    return [...this.records.values()];
  }

  save(booking: NewBooking, code: string): Promise<SavedBooking | null> {
    if (this.all.some((record) => record.code === code)) {
      return Promise.resolve(null);
    }
    const id = `booking-${this.nextId}`;
    this.nextId += 1;
    this.records.set(id, {
      id,
      code,
      flightId: booking.flightId,
      buyerName: booking.buyerName,
      buyerEmail: booking.buyerEmail.toLowerCase(),
      total: booking.total,
      cardBrand: booking.cardBrand,
      cardLast4: booking.cardLast4,
      createdAt: booking.createdAt,
      passengers: booking.passengers
        .map(({ row, letter, name }) => ({ row, letter, name }))
        .sort((a, b) => a.row - b.row || a.letter.localeCompare(b.letter)),
    });
    return Promise.resolve({ id, code });
  }

  findByCodeAndEmail(code: string, email: string): Promise<BookingRecord | null> {
    const record = this.all.find((item) => item.code === code && item.buyerEmail === email);
    return Promise.resolve(record ?? null);
  }

  findById(bookingId: string): Promise<BookingRecord | null> {
    return Promise.resolve(this.records.get(bookingId) ?? null);
  }

  /** Inserta una reserva ya hecha (para las pruebas de consulta). */
  seed(record: Omit<BookingRecord, 'passengers'> & { seats: Record<string, string> }): void {
    const passengers = Object.entries(record.seats).map(([seatCode, name]) => {
      const position = parseSeatCode(seatCode);
      if (position === null) {
        throw new Error(`Asiento inválido en el doble: ${seatCode}`);
      }
      return { ...position, name };
    });
    const { seats: _seats, ...rest } = record;
    this.records.set(record.id, { ...rest, passengers });
  }

  snapshot(): unknown {
    return { records: new Map(this.records), nextId: this.nextId };
  }

  restore(state: unknown): void {
    const saved = state as { records: Map<string, BookingRecord>; nextId: number };
    this.records = saved.records;
    this.nextId = saved.nextId;
  }
}

/**
 * Pasarela programable: se comporta como la ficticia y además permite forzar el próximo
 * resultado. Solo registra los montos cobrados, nunca la tarjeta.
 */
export class ScriptedPaymentGateway implements PaymentGateway {
  readonly charges: number[] = [];
  private scripted: ChargeResult[] = [];

  declineNext(reason = 'INSUFFICIENT_FUNDS'): void {
    this.scripted.push({ approved: false, reason });
  }

  approveNext(cardBrand: CardBrand, cardLast4: string): void {
    this.scripted.push({ approved: true, cardBrand, cardLast4 });
  }

  charge(request: ChargeRequest): Promise<ChargeResult> {
    this.charges.push(request.amount);
    const scripted = this.scripted.shift();
    if (scripted !== undefined) {
      return Promise.resolve(scripted);
    }
    const { number } = request.card;
    if (number === DECLINED_TEST_CARD) {
      return Promise.resolve({ approved: false, reason: 'CARD_DECLINED' });
    }
    return Promise.resolve({
      approved: true,
      cardBrand: detectCardBrand(number),
      cardLast4: lastFourDigits(number),
    });
  }
}

/** Estado del vuelo programable: indica si la reserva agotó el vuelo. */
export class StubFlightStatusPort implements FlightStatusPort {
  soldOut = false;
  readonly calls: string[] = [];

  markSoldOutIfFull(flightId: string): Promise<boolean> {
    this.calls.push(flightId);
    return Promise.resolve(this.soldOut);
  }
}
