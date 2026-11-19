import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { allSeatPositions, formatSeatCode, seatTypeOf } from '@kata/shared';
import { SeatMapComponent } from './seat-map.component';
import type { SeatCell, SeatDisplay } from './seat-cell';

function cells(overrides: Record<string, SeatDisplay> = {}): SeatCell[] {
  return allSeatPositions().map(({ row, letter }) => {
    const seatId = formatSeatCode(row, letter);
    return {
      seatId,
      row,
      letter,
      type: seatTypeOf(letter),
      price: 250_000,
      display: overrides[seatId] ?? 'available',
    };
  });
}

describe('SeatMapComponent', () => {
  let fixture: ComponentFixture<SeatMapComponent>;
  let toggled: string[];

  beforeEach(async () => {
    toggled = [];
    fixture = TestBed.createComponent(SeatMapComponent);
    fixture.componentInstance.toggle.subscribe((seatId) => toggled.push(seatId));
    fixture.componentRef.setInput(
      'seats',
      cells({ '12C': 'available', '12D': 'mine', '1A': 'other', '1B': 'booked' }),
    );
    await fixture.whenStable();
  });

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (seatId: string): HTMLButtonElement =>
    host().querySelector(`button[data-seat="${seatId}"]`) as HTMLButtonElement;
  const press = (seatId: string, key: string): void => {
    button(seatId).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  };

  it('dibuja 180 asientos con 30 filas numeradas a ambos lados y el frente del avión', () => {
    expect(host().querySelectorAll('button[data-seat]')).toHaveLength(180);
    expect(host().querySelectorAll('.row-label')).toHaveLength(60);
    expect(host().textContent).toContain('Frente del avión');
  });

  it('anuncia código, tipo y estado: "Asiento 12C, pasillo, disponible"', () => {
    expect(button('12C').getAttribute('aria-label')).toBe('Asiento 12C, pasillo, disponible');
    expect(button('12D').getAttribute('aria-label')).toBe(
      'Asiento 12D, pasillo, seleccionado por ti',
    );
    expect(button('1A').getAttribute('aria-label')).toBe(
      'Asiento 1A, ventana, bloqueado por otra persona',
    );
    expect(button('1B').getAttribute('aria-label')).toBe('Asiento 1B, medio, reservado');
    expect(button('12C').getAttribute('title')).toContain('$');
  });

  it('roving tabindex: un solo asiento en el orden de tabulación y flechas para moverse', async () => {
    expect(host().querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
    expect(button('1A').tabIndex).toBe(0);
    button('1A').focus();
    press('1A', 'ArrowRight');
    await fixture.whenStable();
    expect(document.activeElement).toBe(button('1B'));
    press('1B', 'ArrowDown');
    await fixture.whenStable();
    expect(document.activeElement).toBe(button('2B'));
    press('2B', 'ArrowRight');
    press('2C', 'ArrowRight');
    await fixture.whenStable();
    expect(document.activeElement).toBe(button('2D'));
    press('2D', 'End');
    await fixture.whenStable();
    expect(document.activeElement).toBe(button('2F'));
    press('2F', 'ArrowUp');
    press('1F', 'ArrowUp');
    await fixture.whenStable();
    expect(document.activeElement).toBe(button('1F'));
    expect(button('1F').tabIndex).toBe(0);
  });

  it('Enter o Espacio bloquean o liberan el asiento enfocado', () => {
    press('12C', 'Enter');
    press('12D', ' ');
    expect(toggled).toEqual(['12C', '12D']);
  });

  it('no emite en asientos reservados o de otra persona', () => {
    button('1B').click();
    button('1A').click();
    expect(toggled).toEqual([]);
  });

  it('si el vuelo está cancelado o agotado se deshabilita con el motivo', async () => {
    fixture.componentRef.setInput('disabledReason', 'Este vuelo fue cancelado.');
    await fixture.whenStable();
    expect(host().textContent).toContain('Este vuelo fue cancelado.');
    expect(button('12C').getAttribute('aria-disabled')).toBe('true');
    button('12C').click();
    expect(toggled).toEqual([]);
  });

  it('mientras se resincroniza no permite acciones', async () => {
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    button('12C').click();
    expect(toggled).toEqual([]);
  });

  it('resalta un cambio remoto sin mover el foco', async () => {
    button('5E').focus();
    fixture.componentRef.setInput('highlighted', new Set(['20A']));
    await fixture.whenStable();
    expect(button('20A').classList.contains('flash')).toBe(true);
    expect(document.activeElement).toBe(button('5E'));
  });
});
