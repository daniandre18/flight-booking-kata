import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BookingLookupComponent } from './booking-lookup.component';

describe('BookingLookupComponent', () => {
  let fixture: ComponentFixture<BookingLookupComponent>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(BookingLookupComponent);
    await fixture.whenStable();
  });

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('muestra el encabezado, los iconos y los campos de consulta', () => {
    expect(host().querySelector('h2')?.textContent).toContain('Gestiona tu reserva');
    expect(host().textContent).toContain('ver tu pase de abordar o cambiar asientos');
    expect(host().querySelectorAll('app-icon')).toHaveLength(3);
    expect((host().querySelector('#lookup-code') as HTMLInputElement).placeholder).toBe('Ej. KT8942');
    expect((host().querySelector('#lookup-email') as HTMLInputElement).placeholder).toBe('tu@correo.com');
  });

  it('emite una consulta normalizada cuando se completa el formulario', async () => {
    const requests: unknown[] = [];
    fixture.componentInstance.lookup.subscribe((request) => requests.push(request));
    const code = host().querySelector('#lookup-code') as HTMLInputElement;
    const email = host().querySelector('#lookup-email') as HTMLInputElement;
    code.value = 'kt8942';
    code.dispatchEvent(new Event('input'));
    email.value = 'ANA@EXAMPLE.COM';
    email.dispatchEvent(new Event('input'));
    (host().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(requests).toEqual([{ code: 'KT8942', email: 'ana@example.com' }]);
  });
});
