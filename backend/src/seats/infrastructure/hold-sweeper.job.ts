import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { APP_CONFIG, type AppConfig } from '../../shared-kernel/infrastructure/config';
import { ReleaseExpiredHoldsUseCase } from '../application/release-expired-holds.use-case';

export const HOLD_SWEEPER_INTERVAL = 'hold-sweeper';

/**
 * Dispara la liberación de vencidos (research.md §11): una pasada al arrancar, antes de aceptar
 * tráfico (`onApplicationBootstrap` corre dentro de `app.init()`, antes de `listen`), y luego cada
 * `HOLD_SWEEP_INTERVAL_MS`. Nunca solapa pasadas. No contiene lógica de negocio.
 */
@Injectable()
export class HoldSweeperJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HoldSweeperJob.name);
  private running: Promise<void> | null = null;

  constructor(
    private readonly releaseExpired: ReleaseExpiredHoldsUseCase,
    private readonly scheduler: SchedulerRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sweep();
    const interval = setInterval(() => void this.sweep(), this.config.holdSweepIntervalMs);
    this.scheduler.addInterval(HOLD_SWEEPER_INTERVAL, interval);
  }

  /** Detiene el intervalo y espera la pasada en curso antes de cerrar la base. */
  async onModuleDestroy(): Promise<void> {
    if (this.scheduler.doesExist('interval', HOLD_SWEEPER_INTERVAL)) {
      this.scheduler.deleteInterval(HOLD_SWEEPER_INTERVAL);
    }
    await this.running;
  }

  /** Una pasada; si la anterior sigue en curso, devuelve esa misma. */
  sweep(): Promise<void> {
    this.running ??= this.runOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce(): Promise<void> {
    try {
      const result = await this.releaseExpired.execute();
      for (const failure of result.failures) {
        this.logger.error(
          { err: failure.error, flightId: failure.flightId },
          'No se pudieron liberar los bloqueos vencidos del vuelo',
        );
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Falló la pasada de liberación de bloqueos vencidos');
    }
  }
}
