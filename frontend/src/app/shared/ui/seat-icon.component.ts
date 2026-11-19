import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SeatDisplay } from '../../features/seat-map/seat-cell';

/**
 * Asiento de avión en SVG (respaldo con cabecero, cojín y apoyabrazos), visto desde arriba con el
 * frente hacia el pasillo delantero. El color depende del estado, y cada estado lleva además una
 * marca (✓, ✕, reloj o guion) para no depender solo del color (RUX-006). Decorativo: el nombre
 * accesible lo da el botón que lo contiene.
 */
@Component({
  selector: 'app-seat-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="seat-svg st-{{ status() }}"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <svg:rect class="arm" x="2.5" y="15" width="6" height="19" rx="3" />
      <svg:rect class="arm" x="31.5" y="15" width="6" height="19" rx="3" />
      <svg:rect class="back" x="7.5" y="3.5" width="25" height="23" rx="7" />
      <svg:rect class="head" x="12" y="6.5" width="16" height="4" rx="2" />
      <svg:rect class="cushion" x="6.5" y="24.5" width="27" height="11" rx="4.5" />
      @switch (status()) {
        @case ('mine') {
          <svg:path class="mark" d="M14 16.5l4 4 8-8.5" />
        }
        @case ('booked') {
          <svg:path class="mark" d="M14 11l12 12M26 11L14 23" />
        }
        @case ('other') {
          <svg:circle class="mark" cx="20" cy="16.5" r="5.5" />
          <svg:path class="mark thin" d="M20 13.5v3.2l2.2 1.4" />
        }
        @case ('unavailable') {
          <svg:path class="mark" d="M15 16.5h10" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 100%;
      height: 100%;
    }
    .seat-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .arm,
    .back,
    .cushion {
      fill: var(--seat-fill);
      stroke: var(--seat-stroke);
      stroke-width: 1.5;
      transition:
        fill 200ms ease,
        stroke 200ms ease;
    }
    .head {
      fill: var(--seat-head);
    }
    .mark {
      fill: none;
      stroke: var(--seat-mark);
      stroke-width: 2.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .thin {
      stroke-width: 1.8;
    }
    /* Disponible: gris claro con contorno (≥ 3:1 frente al fondo de la cabina). */
    .st-available {
      --seat-fill: #e5e7eb;
      --seat-stroke: #6b7280;
      --seat-head: #f9fafb;
    }
    /* Seleccionado por mí: azul vibrante con brillo. */
    .st-mine {
      --seat-fill: #2563eb;
      --seat-stroke: #1d4ed8;
      --seat-head: #60a5fa;
      --seat-mark: #ffffff;
      filter: drop-shadow(0 0 5px rgb(37 99 235 / 0.75));
    }
    /* Bloqueado por otra persona: ámbar con reloj. */
    .st-other {
      --seat-fill: #fde68a;
      --seat-stroke: #92400e;
      --seat-head: #fef3c7;
      --seat-mark: #92400e;
    }
    /* Ocupado (reservado): gris oscuro tachado. */
    .st-booked {
      --seat-fill: #374151;
      --seat-stroke: #1f2937;
      --seat-head: #4b5563;
      --seat-mark: #f9fafb;
    }
    /* No disponible (vuelo cancelado o agotado): atenuado. */
    .st-unavailable {
      --seat-fill: #f3f4f6;
      --seat-stroke: #9ca3af;
      --seat-head: #f9fafb;
      --seat-mark: #6b7280;
    }
    @media (prefers-reduced-motion: reduce) {
      .arm,
      .back,
      .cushion {
        transition: none;
      }
    }
  `,
})
export class SeatIconComponent {
  readonly status = input.required<SeatDisplay>();
}
