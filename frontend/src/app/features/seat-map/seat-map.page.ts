import { ChangeDetectionStrategy, Component, inject, input, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FlightRoomSync } from '../../core/flight-state/flight-room-sync';
import { FlightHeaderComponent } from '../../shared/ui/flight-header.component';
import { SeatLegendComponent } from './seat-legend.component';
import { SeatMapComponent } from './seat-map.component';
import { SeatMapStore } from './seat-map.store';
import { SeatSummaryPanelComponent } from './seat-summary-panel.component';

/** `/flights/:id/seats`: mapa, leyenda, panel de resumen y store (HU2). */
@Component({
  selector: 'app-seat-map-page',
  imports: [
    FlightHeaderComponent,
    SeatLegendComponent,
    SeatMapComponent,
    SeatSummaryPanelComponent,
    RouterLink,
  ],
  providers: [FlightRoomSync, SeatMapStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/search">← Volver a la búsqueda</a>
    @if (store.failed()) {
      <p class="notice notice-danger" role="alert">
        No pudimos cargar este vuelo. Vuelve a la búsqueda y elige otro.
      </p>
    } @else {
      <app-flight-header [flight]="store.flight()" />
      @if (store.busy()) {
        <p class="notice notice-info" role="status">
          Actualizando el mapa… las acciones se reactivan en un momento.
        </p>
      }
      <p class="visually-hidden" aria-live="polite">{{ store.announcement() }}</p>
      <div class="layout">
        <div>
          <app-seat-legend />
          <app-seat-map
            [seats]="store.cells()"
            [disabledReason]="store.closedReason()"
            [busy]="store.busy()"
            [highlighted]="store.highlighted()"
            (toggle)="store.toggle($event)"
          />
        </div>
        <app-seat-summary-panel
          [seats]="store.mySeats()"
          [expiresAt]="store.expiresAt()"
          [offsetMs]="store.offsetMs()"
          [busy]="store.busy()"
          [closedReason]="store.closedReason()"
          (release)="store.release($event)"
          (expired)="store.onExpired()"
          (pay)="goToCheckout()"
        />
      </div>
    }
  `,
  styles: `
    .layout {
      display: grid;
      gap: var(--space-4);
      grid-template-columns: 1fr;
    }
    @media (min-width: 641px) {
      .layout {
        grid-template-columns: minmax(0, 1fr) 320px;
        align-items: start;
      }
    }
  `,
})
export class SeatMapPage implements OnInit {
  readonly id = input.required<string>();
  protected readonly store = inject(SeatMapStore);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.store.init(this.id());
  }

  protected goToCheckout(): void {
    void this.router.navigate(['/checkout'], { queryParams: { flight: this.id() } });
  }
}
