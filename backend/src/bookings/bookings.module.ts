import { Module } from '@nestjs/common';
import {
  FLIGHT_QUERY_PORT,
  FLIGHT_STATUS_PORT,
  FlightsModule,
  type FlightQueryPort,
  type FlightStatusPort,
} from '../flights';
import { SEAT_BOOKING_PORT, SeatsModule, type SeatBookingPort } from '../seats';
import {
  FLIGHT_WRITE_CONTEXT,
  type FlightWriteContext,
} from '../shared-kernel/application/flight-write-context';
import { ConfirmBookingUseCase } from './application/confirm-booking.use-case';
import { LookupBookingUseCase } from './application/lookup-booking.use-case';
import {
  BOOKING_LOOKUP_PORT,
  type BookingLookupPort,
} from './application/ports/booking-lookup.port';
import { BOOKING_PORTS, type BookingPorts } from './application/ports/booking-ports';
import { BOOKING_STORE, type BookingStore } from './application/ports/booking-store.port';
import {
  IDEMPOTENCY_STORE,
  type IdempotencyStore,
} from './application/ports/idempotency-store.port';
import { PAYMENT_GATEWAY, type PaymentGateway } from './application/ports/payment-gateway.port';
import { FakePaymentGateway } from './infrastructure/fake-payment.gateway';
import { BookingsController } from './infrastructure/http/bookings.controller';
import { PrismaBookingLookup } from './infrastructure/persistence/prisma-booking.lookup';
import { PrismaBookingStore } from './infrastructure/persistence/prisma-booking.store';
import { PrismaIdempotencyStore } from './infrastructure/persistence/prisma-idempotency.store';

type BookingDependencies = [
  IdempotencyStore,
  SeatBookingPort,
  PaymentGateway,
  BookingStore,
  BookingLookupPort,
  FlightQueryPort,
  FlightStatusPort,
];

/** Construye `BookingPorts`; la tupla cuenta como un solo parámetro (`max-params`). */
function buildBookingPorts(
  ...[idempotency, seats, payments, bookings, lookup, flights, flightStatus]: BookingDependencies
): BookingPorts {
  return { idempotency, seats, payments, bookings, lookup, flights, flightStatus };
}

/**
 * Reservas (HU3). Escribe solo `bookings`, `booking_seats` e `idempotency_keys`; los asientos y el
 * estado del vuelo los cambia a través de los puertos públicos de seats y flights.
 */
@Module({
  imports: [FlightsModule, SeatsModule],
  controllers: [BookingsController],
  providers: [
    { provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway },
    { provide: IDEMPOTENCY_STORE, useClass: PrismaIdempotencyStore },
    { provide: BOOKING_STORE, useClass: PrismaBookingStore },
    { provide: BOOKING_LOOKUP_PORT, useClass: PrismaBookingLookup },
    {
      provide: BOOKING_PORTS,
      useFactory: buildBookingPorts,
      inject: [
        IDEMPOTENCY_STORE,
        SEAT_BOOKING_PORT,
        PAYMENT_GATEWAY,
        BOOKING_STORE,
        BOOKING_LOOKUP_PORT,
        FLIGHT_QUERY_PORT,
        FLIGHT_STATUS_PORT,
      ],
    },
    {
      provide: ConfirmBookingUseCase,
      useFactory: (context: FlightWriteContext, ports: BookingPorts) =>
        new ConfirmBookingUseCase(context, ports),
      inject: [FLIGHT_WRITE_CONTEXT, BOOKING_PORTS],
    },
    {
      provide: LookupBookingUseCase,
      useFactory: (context: FlightWriteContext, ports: BookingPorts) =>
        new LookupBookingUseCase(ports.lookup, ports.flights, context.clock),
      inject: [FLIGHT_WRITE_CONTEXT, BOOKING_PORTS],
    },
  ],
})
export class BookingsModule {}
