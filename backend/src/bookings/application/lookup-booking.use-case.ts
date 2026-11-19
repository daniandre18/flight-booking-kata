import type { FlightQueryPort } from '../../flights';
import type { Clock } from '../../shared-kernel/domain/clock';
import { normalizeBookingCode } from '../domain/booking-code';
import { normalizeEmail } from '../domain/booking-request';
import { loadBookingView, type BookingView } from './booking-view';
import type { BookingLookupPort } from './ports/booking-lookup.port';

export interface LookupBookingQuery {
  code: string;
  email: string;
}

/**
 * Consulta del boleto con código y correo (HU3, RF-021). Si cualquiera de los dos no coincide,
 * responde el mismo `BOOKING_NOT_FOUND`: no revela si el código existe.
 */
export class LookupBookingUseCase {
  constructor(
    private readonly lookup: BookingLookupPort,
    private readonly flights: FlightQueryPort,
    private readonly clock: Clock,
  ) {}

  async execute(query: LookupBookingQuery): Promise<BookingView> {
    const record = await this.lookup.findByCodeAndEmail(
      normalizeBookingCode(query.code),
      normalizeEmail(query.email),
    );
    return loadBookingView(this.flights, record, this.clock.now());
  }
}
