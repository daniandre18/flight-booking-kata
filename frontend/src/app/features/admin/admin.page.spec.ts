import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FlightDto } from '@kata/shared';
import { ApiService } from '../../core/api.service';
import { AdminPage } from './admin.page';

const FLIGHT: FlightDto = {
  id: '5b0c6f1e-0d3a-4f7e-9c41-2a8e1f0b7d10',
  seq: 1,
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
};

describe('AdminPage', () => {
  let fixture: ComponentFixture<AdminPage>;
  let api: { searchFlights: ReturnType<typeof vi.fn>; getFlight: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    sessionStorage.clear();
    api = {
      searchFlights: vi.fn().mockResolvedValue([FLIGHT]),
      getFlight: vi.fn(),
    };
    await TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();
    await fixture.componentInstance['loadOperationFlights']();
    fixture.detectChanges();
  });

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('muestra los vuelos operativos y carga el ID al seleccionar uno', () => {
    const rows = host().querySelectorAll('.flight-row');
    expect(rows).toHaveLength(3);
    (rows[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((host().querySelector('#admin-flight') as HTMLInputElement).value).toBe(FLIGHT.id);
    expect(host().querySelector('.flight-row.selected')?.textContent).toContain('KT1002');
  });

  it('cambia entre retrasar y cancelar con tarjetas de acción', () => {
    const cancel = host().querySelector('.action-cancel') as HTMLButtonElement;
    cancel.click();
    fixture.detectChanges();
    expect(cancel.getAttribute('aria-pressed')).toBe('true');
    expect(host().querySelector('.submit-action')?.textContent).toContain('Cancelar vuelo');
  });

  it('permite mostrar y ocultar la clave de administrador', () => {
    const key = host().querySelector('#admin-key') as HTMLInputElement;
    const toggle = host().querySelector('.icon-button') as HTMLButtonElement;
    expect(key.type).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect(key.type).toBe('text');
  });
});
