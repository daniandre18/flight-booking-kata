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
  templateUrl: './seat-icon.component.html',
  styleUrl: './seat-icon.component.scss',
})
export class SeatIconComponent {
  readonly status = input.required<SeatDisplay>();
}
