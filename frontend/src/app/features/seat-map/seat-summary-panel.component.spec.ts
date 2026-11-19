import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SeatSummaryPanelComponent, type SummarySeat } from './seat-summary-panel.component';

const SEATS: SummarySeat[] = [
  { seatId: '12C', type: 'AISLE', price: 250_000 },
  { seatId: '12D', type: 'AISLE', price: 250_000 },
];

describe('SeatSummaryPanelComponent', () => {
  let fixture: ComponentFixture<SeatSummaryPanelComponent>;
  let paid: number;
  let expired: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T15:00:00.000Z'));
    paid = 0;
    expired = 0;
    fixture = TestBed.createComponent(SeatSummaryPanelComponent);
    fixture.componentInstance.pay.subscribe(() => (paid += 1));
    fixture.componentInstance.expired.subscribe(() => (expired += 1));
  });

  afterEach(() => vi.useRealTimers());

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const payButton = (): HTMLButtonElement =>
    host().querySelector('button.pay') as HTMLButtonElement;
  const text = (): string => host().textContent?.replace(/\s+/g, ' ') ?? '';

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await vi.advanceTimersByTimeAsync(0);
    await fixture.whenStable();
  }

  it('muestra asientos, precio por asiento y total', async () => {
    await render({ seats: SEATS, expiresAt: '2026-11-18T15:10:00.000Z' });
    expect(text()).toContain('12C');
    expect(text()).toContain('12D');
    expect(text()).toMatch(/Total\s*\$\s?500\.000/);
    expect(text()).toContain('10:00');
  });

  it('el botón de pago solo se habilita con bloqueos vigentes', async () => {
    await render({ seats: [], expiresAt: null });
    expect(payButton().disabled).toBe(true);
    expect(text()).toContain('Aún no has elegido asientos');
    await render({ seats: SEATS, expiresAt: '2026-11-18T15:10:00.000Z' });
    expect(payButton().disabled).toBe(false);
    payButton().click();
    expect(paid).toBe(1);
    await render({ busy: true });
    expect(payButton().disabled).toBe(true);
  });

  it('muestra el aviso del último minuto', async () => {
    await render({ seats: SEATS, expiresAt: '2026-11-18T15:00:45.000Z' });
    expect(text()).toContain('Queda menos de 1 minuto');
  });

  it('al vencer se vacía, avisa y deshabilita el pago', async () => {
    await render({ seats: SEATS, expiresAt: '2026-11-18T15:00:01.000Z' });
    await vi.advanceTimersByTimeAsync(1_500);
    await fixture.whenStable();
    expect(expired).toBe(1);
    expect(text()).toContain('Tu tiempo terminó');
    expect(text()).not.toContain('12C');
    expect(payButton().disabled).toBe(true);
  });

  it('si el vuelo se cerró, explica el motivo y no deja pagar', async () => {
    await render({
      seats: SEATS,
      expiresAt: '2026-11-18T15:10:00.000Z',
      closedReason: 'Este vuelo fue cancelado.',
    });
    expect(text()).toContain('Este vuelo fue cancelado.');
    expect(payButton().disabled).toBe(true);
  });
});
