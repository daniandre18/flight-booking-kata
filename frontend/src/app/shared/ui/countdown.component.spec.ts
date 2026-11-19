import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CountdownComponent } from './countdown.component';

describe('CountdownComponent', () => {
  let fixture: ComponentFixture<CountdownComponent>;
  let expired: number;
  const START = new Date('2026-11-18T15:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    expired = 0;
    fixture = TestBed.createComponent(CountdownComponent);
    fixture.componentInstance.expired.subscribe(() => (expired += 1));
  });

  afterEach(() => vi.useRealTimers());

  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const timer = (): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector('.countdown') as HTMLElement;

  /** Avanza el reloj falso y vuelve a pintar (con temporizadores falsos, sin esperar a whenStable). */
  async function advance(milliseconds: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(milliseconds);
    fixture.detectChanges();
  }

  async function render(expiresAt: string, offsetMs = 0): Promise<void> {
    fixture.componentRef.setInput('expiresAt', expiresAt);
    fixture.componentRef.setInput('offsetMs', offsetMs);
    await advance(0);
  }

  it('muestra mm:ss del tiempo restante', async () => {
    await render('2026-11-18T15:10:00.000Z');
    expect(text()).toContain('10:00');
    await advance(61_000);
    expect(text()).toContain('08:59');
  });

  it('corrige el desfase entre el reloj del servidor y el del navegador', async () => {
    // El servidor va 30 s adelantado respecto al navegador.
    await render('2026-11-18T15:10:00.000Z', 30_000);
    expect(text()).toContain('09:30');
  });

  it('con 60 s o menos cambia de aspecto y avisa', async () => {
    await render('2026-11-18T15:01:01.000Z');
    expect(timer().classList.contains('warning')).toBe(false);
    await advance(1_000);
    expect(timer().classList.contains('warning')).toBe(true);
    expect(text()).toContain('Queda menos de 1 minuto');
  });

  it('emite expired una sola vez al llegar a 0', async () => {
    await render('2026-11-18T15:00:02.000Z');
    expect(expired).toBe(0);
    await advance(2_500);
    expect(text()).toContain('00:00');
    expect(expired).toBe(1);
    await advance(5_000);
    expect(expired).toBe(1);
  });
});
