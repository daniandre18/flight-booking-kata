import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { BookingDto } from '@kata/shared';
import { BookingTicketComponent } from './booking-ticket.component';

const BOOKING: BookingDto = {
  code: 'AB12CD',
  flight: {
    id: '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10',
    flightNumber: 'KT1002',
    origin: 'CTG',
    destination: 'CLO',
    scheduledDepartureAt: '2026-11-20T14:30:00.000Z',
    departureAt: '2026-11-20T14:30:00.000Z',
    arrivalAt: '2026-11-20T16:00:00.000Z',
    durationMinutes: 90,
    fare: 250_000,
    status: 'SCHEDULED',
    delayed: false,
    availableSeats: 42,
    capacity: 180,
    seq: 1,
  },
  buyer: { name: 'Ana Gómez', email: 'ana@example.com' },
  passengers: [{ seatId: '14A', name: 'Ana Gómez', type: 'WINDOW' }],
  total: 250_000,
  cardBrand: 'VISA',
  cardLast4: '1111',
  createdAt: '2026-11-19T12:00:00.000Z',
};

describe('BookingTicketComponent', () => {
  let fixture: ComponentFixture<BookingTicketComponent>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(BookingTicketComponent);
    fixture.componentRef.setInput('booking', BOOKING);
    await fixture.whenStable();
  });

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('presenta la reserva como pase de abordar con la ruta, asiento y código', () => {
    const text = host().textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('CTG');
    expect(text).toContain('CLO');
    expect(text).toContain('KT1002');
    expect(text).toContain('Ana Gómez');
    expect(text).toContain('14A');
    expect(text).toContain('AB12CD');
    expect(text).toContain('Confirmado');
    expect(host().querySelectorAll('.qr i')).toHaveLength(169);
  });

  it('abre el diálogo de impresión para guardar el pase como PDF', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    (host().querySelector('button') as HTMLButtonElement).click();
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('permite iniciar una nueva consulta', () => {
    let requested = false;
    fixture.componentInstance.newLookup.subscribe(() => (requested = true));
    const buttons = host().querySelectorAll('button');
    (buttons[1] as HTMLButtonElement).click();
    expect(requested).toBe(true);
  });
});
