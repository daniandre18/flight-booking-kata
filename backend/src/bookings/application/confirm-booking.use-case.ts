import type { CreateBookingRequest } from '@kata/shared';
import type { FlightView } from '../../flights';
import type { FlightWriteContext } from '../../shared-kernel/application/flight-write-context';
import {
  recordFlightChange,
  type RecordedFlightChange,
} from '../../shared-kernel/application/record-flight-change';
import { DomainError } from '../../shared-kernel/domain/domain-error';
import { generateBookingCode } from '../domain/booking-code';
import {
  assignBookedSeats,
  passengerSeatPositions,
  type BookedPassenger,
} from '../domain/booking-policy';
import {
  assertSameRequest,
  bookingRequestHash,
  bookingTotal,
  normalizeEmail,
} from '../domain/booking-request';
import { bookingDrafts, bookingEvents, type BookingChange } from './booking-events';
import { loadBookingView, type BookingView } from './booking-view';
import type { BookingPorts } from './ports/booking-ports';
import type { NewBooking } from './ports/booking-store.port';
import type { IdempotencyKeyRef } from './ports/idempotency-store.port';

export interface ConfirmBookingCommand {
  clientId: string;
  idempotencyKey: string;
  request: CreateBookingRequest;
}

export interface ConfirmBookingResult {
  view: BookingView;
  /** `true` si la misma clave ya había confirmado esta reserva (responde 200). */
  replayed: boolean;
}

/** Fuente del código de reserva; inyectable para probar las colisiones. */
export type BookingCodeGenerator = () => string;

/** Con 36^6 códigos posibles, agotar los intentos indica un error, no mala suerte. */
export const MAX_BOOKING_CODE_ATTEMPTS = 5;

type ConfirmOutcome =
  | { kind: 'replayed'; bookingId: string }
  | ({ kind: 'created'; bookingId: string; change: BookingChange } & RecordedFlightChange);

/**
 * Confirma todo o nada los bloqueos vigentes del cliente (HU3; research.md §9–§10). Una sola
 * UnitOfWork: clave de idempotencia → lock del vuelo → HELD→BOOKED → verificación → cobro →
 * reserva → AGOTADO → eventos. Cualquier error deshace todo; publica solo tras el commit.
 */
export class ConfirmBookingUseCase {
  constructor(
    private readonly context: FlightWriteContext,
    private readonly ports: BookingPorts,
    private readonly generateCode: BookingCodeGenerator = generateBookingCode,
  ) {}

  async execute(command: ConfirmBookingCommand): Promise<ConfirmBookingResult> {
    const now = this.context.clock.now();
    const outcome = await this.context.uow.run(() => this.confirm(command, now));
    if (outcome.kind === 'created') {
      this.context.publisher.publish(
        bookingEvents(outcome.change, outcome.events, outcome.summary),
      );
    }
    const record = await this.ports.lookup.findById(outcome.bookingId);
    const view = await loadBookingView(this.ports.flights, record, now);
    return { view, replayed: outcome.kind === 'replayed' };
  }

  private async confirm(command: ConfirmBookingCommand, now: Date): Promise<ConfirmOutcome> {
    const key = keyOf(command);
    const requestHash = bookingRequestHash(command.request);
    const reservation = await this.ports.idempotency.reserve({ ...key, requestHash });
    if (reservation.status === 'existing') {
      assertSameRequest(reservation.requestHash, requestHash);
      return { kind: 'replayed', bookingId: reservation.bookingId };
    }
    const { flightId } = command.request;
    await this.context.writeLock.acquire(flightId, 'bookable', now);
    const booked = await this.bookHeldSeats(command, now);
    const flight = await this.requireFlight(flightId, now);
    const bookingId = await this.chargeAndSave(command, booked, flight, now);
    await this.ports.idempotency.attach(key, bookingId);
    const soldOut = await this.ports.flightStatus.markSoldOutIfFull(flightId);
    const change: BookingChange = { booked, flight, soldOut, occurredAt: now };
    const recorded = await recordFlightChange(this.context, flightId, bookingDrafts(change));
    return { kind: 'created', bookingId, change, ...recorded };
  }

  private async bookHeldSeats(
    command: ConfirmBookingCommand,
    now: Date,
  ): Promise<BookedPassenger[]> {
    const { flightId, passengers } = command.request;
    const write = await this.ports.seats.markBooked({
      flightId,
      clientId: command.clientId,
      seats: passengerSeatPositions(passengers),
      now,
    });
    return assignBookedSeats(passengers, write);
  }

  private async requireFlight(flightId: string, now: Date): Promise<FlightView> {
    const flight = await this.ports.flights.getById(flightId, now);
    if (flight === null) {
      throw new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe');
    }
    return flight;
  }

  /** Cobra con la tarjeta solo en memoria y guarda marca y últimos 4 (principio X). */
  private async chargeAndSave(
    command: ConfirmBookingCommand,
    booked: BookedPassenger[],
    flight: FlightView,
    now: Date,
  ): Promise<string> {
    const { request } = command;
    const total = bookingTotal(flight.fare, booked.length);
    const payment = await this.ports.payments.charge({ amount: total, card: request.card });
    if (!payment.approved) {
      throw new DomainError(
        'PAYMENT_DECLINED',
        'El pago fue rechazado. Tus asientos siguen bloqueados.',
      );
    }
    return this.saveWithUniqueCode({
      flightId: request.flightId,
      clientId: command.clientId,
      buyerName: request.buyer.name,
      buyerEmail: normalizeEmail(request.buyer.email),
      total,
      cardBrand: payment.cardBrand,
      cardLast4: payment.cardLast4,
      createdAt: now,
      passengers: booked,
    });
  }

  private async saveWithUniqueCode(booking: NewBooking): Promise<string> {
    for (let attempt = 1; attempt <= MAX_BOOKING_CODE_ATTEMPTS; attempt += 1) {
      const saved = await this.ports.bookings.save(booking, this.generateCode());
      if (saved !== null) {
        return saved.id;
      }
    }
    throw new Error('No se pudo generar un código de reserva único');
  }
}

function keyOf(command: ConfirmBookingCommand): IdempotencyKeyRef {
  return { clientId: command.clientId, key: command.idempotencyKey };
}
