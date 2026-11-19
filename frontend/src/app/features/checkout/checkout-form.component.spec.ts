import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { BookingDto, CreateBookingRequest } from '@kata/shared';
import { ApiError } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { CheckoutFormComponent } from './checkout-form.component';
import { CheckoutStore } from './checkout.store';

const FLIGHT_ID = '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10';

describe('CheckoutFormComponent', () => {
  let fixture: ComponentFixture<CheckoutFormComponent>;
  let submitted: CreateBookingRequest[];

  beforeEach(async () => {
    submitted = [];
    fixture = TestBed.createComponent(CheckoutFormComponent);
    fixture.componentInstance.submitted.subscribe((request) => submitted.push(request));
    fixture.componentRef.setInput('flightId', FLIGHT_ID);
    fixture.componentRef.setInput('seatIds', ['12C', '12D']);
    await fixture.whenStable();
  });

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const input = (id: string): HTMLInputElement =>
    host().querySelector(`#${id}`) as HTMLInputElement;
  const type = (id: string, value: string): void => {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
  };
  const submit = async (): Promise<void> => {
    (host().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const fillValid = (): void => {
    type('buyer-name', 'Ana Gómez');
    type('buyer-email', 'ana@correo.co');
    type('passenger-12C', 'Ana Gómez');
    type('passenger-12D', 'Luis Pérez');
    type('card-number', '4111111111111111');
    type('card-expiry', '12/30');
    type('card-cvv', '123');
  };

  it('pide un pasajero por asiento, rotulado con su código', () => {
    expect(host().querySelector('label[for="passenger-12C"]')?.textContent).toContain('12C');
    expect(host().querySelector('label[for="passenger-12D"]')?.textContent).toContain('12D');
  });

  it('muestra el error junto a cada campo y conserva lo escrito', async () => {
    type('buyer-name', 'Ana Gómez');
    type('card-number', '4111');
    await submit();
    expect(submitted).toEqual([]);
    expect(host().querySelector('#buyer-email-error')?.textContent?.trim()).not.toBe('');
    expect(host().querySelector('#card-number-error')?.textContent).toContain('16 dígitos');
    expect(input('card-number').getAttribute('aria-invalid')).toBe('true');
    expect(input('buyer-name').value).toBe('Ana Gómez');
    expect(input('card-number').value).toBe('4111');
  });

  it('emite la solicitud validada con el esquema de shared y detecta la marca', async () => {
    fillValid();
    await fixture.whenStable();
    expect(host().textContent).toContain('VISA');
    await submit();
    expect(submitted).toEqual([
      {
        flightId: FLIGHT_ID,
        buyer: { name: 'Ana Gómez', email: 'ana@correo.co' },
        passengers: [
          { seatId: '12C', name: 'Ana Gómez' },
          { seatId: '12D', name: 'Luis Pérez' },
        ],
        card: { number: '4111111111111111', expiry: '12/30', cvv: '123' },
      },
    ]);
  });

  it('deshabilita el botón mientras se procesa y lo reactiva si hay rechazo', async () => {
    const button = (): HTMLButtonElement =>
      host().querySelector('button[type="submit"]') as HTMLButtonElement;
    fixture.componentRef.setInput('processing', true);
    await fixture.whenStable();
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('Procesando');
    fixture.componentRef.setInput('processing', false);
    await fixture.whenStable();
    expect(button().disabled).toBe(false);
  });
});

describe('CheckoutStore (Idempotency-Key)', () => {
  let createBooking: ReturnType<typeof vi.fn>;
  let store: CheckoutStore;
  const request = { flightId: FLIGHT_ID } as CreateBookingRequest;
  const booking = { code: 'ABC123' } as BookingDto;

  beforeEach(() => {
    createBooking = vi.fn();
    TestBed.configureTestingModule({
      providers: [CheckoutStore, { provide: ApiService, useValue: { createBooking } }],
    });
    store = TestBed.inject(CheckoutStore);
  });

  it('reutiliza la misma clave al reintentar tras un rechazo', async () => {
    createBooking
      .mockRejectedValueOnce(new ApiError(402, 'PAYMENT_DECLINED'))
      .mockResolvedValueOnce(booking);
    await expect(store.submit(request)).resolves.toBeNull();
    expect(store.processing()).toBe(false);
    expect(store.error()).toContain('pago fue rechazado');
    await expect(store.submit(request)).resolves.toEqual(booking);
    const [first, second] = createBooking.mock.calls.map((call) => call[1] as string);
    expect(first).toBe(second);
  });

  it('renueva la clave tras el éxito', async () => {
    createBooking.mockResolvedValue(booking);
    await store.submit(request);
    await store.submit(request);
    const [first, second] = createBooking.mock.calls.map((call) => call[1] as string);
    expect(first).not.toBe(second);
  });

  it('un bloqueo vencido (410) marca el pago como vencido', async () => {
    createBooking.mockRejectedValue(new ApiError(410, 'HOLD_EXPIRED'));
    await store.submit(request);
    expect(store.expired()).toBe(true);
  });

  it('ignora un segundo envío mientras el primero sigue en curso (doble clic)', async () => {
    let resolve: (value: BookingDto) => void = () => undefined;
    createBooking.mockReturnValue(new Promise<BookingDto>((done) => (resolve = done)));
    const first = store.submit(request);
    await expect(store.submit(request)).resolves.toBeNull();
    resolve(booking);
    await first;
    expect(createBooking).toHaveBeenCalledTimes(1);
  });
});
