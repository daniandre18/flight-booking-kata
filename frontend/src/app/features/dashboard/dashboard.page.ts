import { ChangeDetectionStrategy, Component, inject, input, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FlightRoomSync } from '../../core/flight-state/flight-room-sync';
import { formatClock, formatPercent } from '../../shared/format';
import { FlightHeaderComponent } from '../../shared/ui/flight-header.component';
import { ActivityLogComponent } from './activity-log.component';
import { DashboardStore } from './dashboard.store';
import { OccupancyBarComponent } from './occupancy-bar.component';
import { StatsCardsComponent } from './stats-cards.component';

/** `/flights/:id/dashboard`: centro de control de ocupación en vivo (RUX-031). */
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
    <section class="dashboard-shell" aria-labelledby="dashboard-title">
      <div class="dashboard-nav">
        <a class="back-link" routerLink="/search">← Volver a la búsqueda</a>
        <span class="live-badge" [class.syncing]="store.syncing()" role="status" aria-live="polite">
          <span class="dot" aria-hidden="true"></span>
          {{ store.syncing() ? 'Sincronizando datos…' : 'En vivo' }}
        </span>
      </div>

      @if (store.failed()) {
        <p class="notice notice-danger" role="alert">
          No pudimos cargar este vuelo. Vuelve a la búsqueda y elige otro.
        </p>
      } @else {
        <header class="dashboard-hero">
          <div>
            <p class="eyebrow">Centro de control</p>
            <h2 id="dashboard-title">Estado del vuelo</h2>
            <app-flight-header [flight]="store.flight()" />
          </div>
          <div class="hero-actions">
            @if (store.lastUpdated(); as updatedAt) {
              <span class="updated-at">Actualizado {{ clock(updatedAt) }}</span>
            }
            <a class="btn btn-secondary" [routerLink]="['/flights', id(), 'seats']">
              Ver mapa de asientos
            </a>
          </div>
        </header>

        @if (store.syncing()) {
          <p class="notice notice-info" role="status">Actualizando el tablero…</p>
        }

        <section class="metrics-section" aria-labelledby="metrics-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Indicadores clave</p>
              <h3 id="metrics-title">Ocupación en tiempo real</h3>
            </div>
            <strong class="occupancy-number">{{ percent(store.occupancyPercent()) }}</strong>
          </div>
          <app-stats-cards [counts]="store.counts()" [occupancy]="store.occupancyPercent()" />
        </section>

        <div class="dashboard-grid">
          <section class="occupancy-card card" aria-labelledby="distribution-title">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Capacidad</p>
                <h3 id="distribution-title">Distribución de asientos</h3>
              </div>
              <span class="capacity-total">{{ store.counts().total }} en total</span>
            </div>
            <app-occupancy-bar
              [counts]="store.counts()"
              [occupancy]="store.occupancyPercent()"
            />
            <ul class="legend" aria-label="Leyenda de estados de asiento">
              <li><span class="legend-dot available"></span>Disponibles</li>
              <li><span class="legend-dot held"></span>Bloqueados</li>
              <li><span class="legend-dot booked"></span>Reservados</li>
            </ul>
          </section>

          <app-activity-log [entries]="store.activity()" />
        </div>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .dashboard-shell { max-width: 1100px; margin: 0 auto; }
    .dashboard-nav, .section-heading, .hero-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .dashboard-nav { margin-bottom: var(--space-4); }
    .back-link { font-weight: 700; text-decoration: none; }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      color: var(--color-success-fg);
      background: var(--color-success-bg);
      font-size: var(--font-size-sm);
      font-weight: 800;
    }
    .live-badge .dot, .legend-dot {
      display: inline-block;
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 50%;
      background: currentColor;
    }
    .live-badge.syncing { color: var(--color-warning-fg); background: var(--color-warning-bg); }
    .live-badge.syncing .dot { animation: pulse 1s ease-in-out infinite; }
    .dashboard-hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-6);
      align-items: end;
      padding: var(--space-6);
      border-radius: var(--radius-lg);
      color: var(--on-navy);
      background: linear-gradient(135deg, var(--navy-900), var(--navy-700));
      box-shadow: var(--shadow-float);
    }
    .dashboard-hero :is(h2, p) { color: inherit; }
    .dashboard-hero h2 { margin-bottom: var(--space-2); font-size: clamp(1.75rem, 4vw, 2.5rem); }
    .dashboard-hero app-flight-header { color: var(--on-navy-muted); }
    .dashboard-hero app-flight-header ::ng-deep .status-CANCELLED { color: #fca5a5; }
    .dashboard-hero app-flight-header ::ng-deep .status-DELAYED { color: #fde68a; }
    .hero-actions { align-items: flex-end; flex-direction: column; }
    .updated-at, .capacity-total { color: var(--on-navy-muted); font-size: var(--font-size-sm); }
    .hero-actions .btn { white-space: nowrap; }
    .eyebrow { margin: 0 0 var(--space-1); font-size: var(--font-size-sm); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .metrics-section { margin-top: var(--space-6); }
    .section-heading { align-items: end; margin-bottom: var(--space-3); }
    .section-heading h3 { margin: 0; }
    .section-heading .eyebrow { color: var(--color-text-muted); }
    .occupancy-number { color: var(--color-primary); font-size: clamp(1.75rem, 4vw, 2.5rem); font-variant-numeric: tabular-nums; }
    .dashboard-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-6); margin-top: var(--space-6); }
    .occupancy-card { padding: var(--space-6); }
    .capacity-total { color: var(--color-text-muted); }
    .legend { display: flex; flex-wrap: wrap; gap: var(--space-3); padding: 0; margin: var(--space-4) 0 0; list-style: none; color: var(--color-text-muted); font-size: var(--font-size-sm); }
    .legend li { display: inline-flex; align-items: center; gap: var(--space-1); }
    .legend-dot.available { color: var(--seat-available-fg); }
    .legend-dot.held { color: var(--seat-other-fg); }
    .legend-dot.booked { color: var(--seat-booked-bg); }
    @keyframes pulse { 50% { opacity: 0.4; transform: scale(0.75); } }
    @media (max-width: 700px) {
      .dashboard-hero, .dashboard-grid { grid-template-columns: 1fr; }
      .hero-actions { align-items: flex-start; }
      .dashboard-hero { padding: var(--space-4); }
    }
    @media (prefers-reduced-motion: reduce) { .live-badge.syncing .dot { animation: none; } }
  `,
})
export class DashboardPage implements OnInit {
  readonly id = input.required<string>();
  protected readonly store = inject(DashboardStore);
  protected readonly clock = formatClock;
  protected readonly percent = formatPercent;

  ngOnInit(): void {
    void this.store.init(this.id());
  }
}
