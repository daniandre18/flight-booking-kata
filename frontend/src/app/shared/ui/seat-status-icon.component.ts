import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SeatDisplay } from '../../features/seat-map/seat-cell';

const GLYPH: Record<SeatDisplay, string> = {
  available: '○',
  mine: '✓',
  other: '◐',
  booked: '✕',
  unavailable: '–',
};

/** Icono por estado: el color nunca es la única señal (RUX-006). Decorativo para lectores. */
@Component({
  selector: 'app-seat-status-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span aria-hidden="true">{{ glyph[status()] }}</span>`,
  styles: `
    :host {
      display: inline-block;
      font-weight: 700;
      line-height: 1;
    }
  `,
})
export class SeatStatusIconComponent {
  readonly status = input.required<SeatDisplay>();
  protected readonly glyph = GLYPH;
}
