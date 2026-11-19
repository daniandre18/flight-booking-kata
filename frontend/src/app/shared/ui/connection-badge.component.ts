import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RealtimeService } from '../../core/realtime.service';

/** Estado de la conexión en tiempo real: "conectado" o "reconectando" (RUX-018). */
@Component({
  selector: 'app-connection-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './connection-badge.component.html',
  styleUrl: './connection-badge.component.scss',
})
export class ConnectionBadgeComponent {
  private readonly realtime = inject(RealtimeService);
  protected readonly connected = computed(() => this.realtime.connection() === 'connected');
}
