import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RealtimeService } from '../../core/realtime.service';

/** Estado de la conexión en tiempo real: "conectado" o "reconectando" (RUX-018). */
@Component({
  selector: 'app-connection-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [class.offline]="!connected()" role="status" aria-live="polite">
      <span class="dot" aria-hidden="true"></span>
      {{ connected() ? 'Conectado' : 'Reconectando…' }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      font-size: var(--font-size-sm);
      font-weight: 600;
      background: var(--color-success-bg);
      color: var(--color-success-fg);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .offline .dot {
      background: transparent;
      border: 2px solid currentColor;
    }
    .offline {
      background: var(--color-warning-bg);
      color: var(--color-warning-fg);
    }
  `,
})
export class ConnectionBadgeComponent {
  private readonly realtime = inject(RealtimeService);
  protected readonly connected = computed(() => this.realtime.connection() === 'connected');
}
