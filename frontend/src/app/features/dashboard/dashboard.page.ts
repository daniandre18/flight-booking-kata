import { ChangeDetectionStrategy, Component, inject, input, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FlightRoomSync } from '../../core/flight-state/flight-room-sync';
import { FlightHeaderComponent } from '../../shared/ui/flight-header.component';
import { ActivityLogComponent } from './activity-log.component';
import { DashboardStore } from './dashboard.store';
import { OccupancyBarComponent } from './occupancy-bar.component';
import { StatsCardsComponent } from './stats-cards.component';

/** `/flights/:id/dashboard`: contadores, barra y registro en vivo, sin recargar (RUX-031). */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    ActivityLogComponent,
    FlightHeaderComponent,
    OccupancyBarComponent,
    StatsCardsComponent,
    RouterLink,
  ],
  providers: [FlightRoomSync, DashboardStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/search">← Volver a la búsqueda</a>
    <h2 class="visually-hidden">Tablero de ocupación</h2>
    @if (store.failed()) {
      <p class="notice notice-danger" role="alert">
        No pudimos cargar este vuelo. Vuelve a la búsqueda y elige otro.
      </p>
    } @else {
      <app-flight-header [flight]="store.flight()" />
      @if (store.syncing()) {
        <p class="notice notice-info" role="status">Actualizando el tablero…</p>
      }
      <app-stats-cards [counts]="store.counts()" [occupancy]="store.occupancyPercent()" />
      <app-occupancy-bar [counts]="store.counts()" [occupancy]="store.occupancyPercent()" />
      <p><a [routerLink]="['/flights', id(), 'seats']">Ver el mapa de asientos</a></p>
      <app-activity-log [entries]="store.activity()" />
    }
  `,
})
export class DashboardPage implements OnInit {
  readonly id = input.required<string>();
  protected readonly store = inject(DashboardStore);

  ngOnInit(): void {
    void this.store.init(this.id());
  }
}
