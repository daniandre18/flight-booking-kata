import { BookingDtoSchema } from '@kata/shared';
import { toBookingDto } from '../../../src/bookings/application/booking-dto.mapper';
import { BOOKING_NOT_FOUND_MESSAGE } from '../../../src/bookings/application/booking-view';
import { LookupBookingUseCase } from '../../../src/bookings/application/lookup-booking.use-case';
import { InMemoryBookingStore } from '../../doubles/bookings.doubles';
import { InMemoryFlightQuery, sampleFlightView } from '../../doubles/flights.doubles';
import { FakeClock } from '../../support/fake-clock';

const FLIGHT = sampleFlightView();

describe('LookupBookingUseCase', () => {
  let bookings: InMemoryBookingStore;
  let flights: InMemoryFlightQuery;
  let useCase: LookupBookingUseCase;

  beforeEach(() => {
    bookings = new InMemoryBookingStore();
    flights = new InMemoryFlightQuery();
    flights.add(FLIGHT);
    bookings.seed({
      id: 'booking-1',
      code: 'AB12CD',
      flightId: FLIGHT.id,
      buyerName: 'Ana Gómez',
      buyerEmail: 'ana@correo.co',
      total: FLIGHT.fare * 2,
      cardBrand: 'MASTERCARD',
      cardLast4: '4444',
      createdAt: new Date('2026-11-18T15:00:00.000Z'),
      seats: { '1A': 'Ana Gómez', '1B': 'Luis Pérez' },
    });
    useCase = new LookupBookingUseCase(bookings, flights, new FakeClock());
  });

  const codeAndMessage = (promise: Promise<unknown>) =>
    promise.catch((error: { code: string; message: string }) => [error.code, error.message]);

  it('encuentra la reserva normalizando código y correo', async () => {
    const view = await useCase.execute({ code: ' ab12cd ', email: 'ANA@Correo.co ' });
    const dto = BookingDtoSchema.parse(toBookingDto(view));
    expect(dto).toMatchObject({
      code: 'AB12CD',
      cardBrand: 'MASTERCARD',
      cardLast4: '4444',
      flight: { id: FLIGHT.id },
      passengers: [
        { seatId: '1A', name: 'Ana Gómez', type: 'WINDOW' },
        { seatId: '1B', name: 'Luis Pérez', type: 'MIDDLE' },
      ],
    });
  });

  it.each([
    ['correo incorrecto', { code: 'AB12CD', email: 'otra@correo.co' }],
    ['código inexistente', { code: 'ZZ99ZZ', email: 'ana@correo.co' }],
  ])('con %s responde el mismo BOOKING_NOT_FOUND', async (_case, query) => {
    await expect(codeAndMessage(useCase.execute(query))).resolves.toEqual([
      'BOOKING_NOT_FOUND',
      BOOKING_NOT_FOUND_MESSAGE,
    ]);
  });

  it('si el vuelo de la reserva no se puede leer responde BOOKING_NOT_FOUND', async () => {
    flights.flights.clear();
    await expect(
      codeAndMessage(useCase.execute({ code: 'AB12CD', email: 'ana@correo.co' })),
    ).resolves.toEqual(['BOOKING_NOT_FOUND', BOOKING_NOT_FOUND_MESSAGE]);
  });
});
