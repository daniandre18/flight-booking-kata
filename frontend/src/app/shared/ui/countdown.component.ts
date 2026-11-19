import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { formatCountdown } from '../format';

const TICK_MS = 250;
const WARNING_MS = 60_000;

/**
 * Cuenta regresiva del bloqueo compartido (RUX-012, RUX-013, RUX-026). Corrige el desfase entre
 * el reloj del servidor y el del navegador con `offsetMs` (= serverNow − Date.now()).
 */
@Component({
  selector: 'app-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (expiresAt()) {
      <span
        class="countdown"
        [class.warning]="warning()"
        role="timer"
        aria-live="off"
        [attr.aria-label]="'Tiempo restante ' + text()"
        >{{ text() }}</span
      >
      @if (warning() && remainingMs() > 0) {
        <span class="warning-text" role="alert">Queda menos de 1 minuto para pagar.</span>
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .countdown {
      font-variant-numeric: tabular-nums;
      font-size: var(--font-size-xl);
      font-weight: 700;
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-info-bg);
      color: var(--color-info-fg);
    }
    .warning {
      background: var(--color-danger-bg);
      color: var(--color-danger-fg);
      outline: 2px solid var(--color-danger-fg);
    }
    .warning-text {
      color: var(--color-danger-fg);
      font-weight: 600;
      font-size: var(--font-size-sm);
    }
  `,
})
export class CountdownComponent {
  readonly expiresAt = input<string | null>(null);
  readonly offsetMs = input(0);
  readonly expired = output<void>();

  private readonly now = signal(Date.now());
  private emittedFor: string | null = null;

  protected readonly remainingMs = computed(() => {
    const expiresAt = this.expiresAt();
    if (expiresAt === null) {
      return 0;
    }
    return Math.max(0, new Date(expiresAt).getTime() - (this.now() + this.offsetMs()));
  });
  protected readonly warning = computed(() => this.remainingMs() <= WARNING_MS);
  protected readonly text = computed(() => formatCountdown(this.remainingMs()));

  constructor() {
    const timer = setInterval(() => this.tick(), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private tick(): void {
    this.now.set(Date.now());
    const expiresAt = this.expiresAt();
    if (expiresAt !== null && this.remainingMs() === 0 && this.emittedFor !== expiresAt) {
      this.emittedFor = expiresAt;
      this.expired.emit();
    }
  }
}
