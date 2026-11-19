import {
  ChangeDetectionStrategy,
  Component,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { BookingLookupRequestSchema, type BookingLookupRequest } from '@kata/shared';
import { inputValue, validate, type FieldErrors } from '../../shared/forms';
import { IconComponent } from '../../shared/ui/icon.component';

/** Consulta del boleto con código y correo, validada con `BookingLookupRequestSchema` (DRY). */
@Component({
  selector: 'app-booking-lookup',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lookup-view" aria-labelledby="lookup-title">
      <div class="lookup-intro">
        <span class="ticket-icon"><app-icon name="ticket" [size]="34" /></span>
        <h2 id="lookup-title">Gestiona tu reserva</h2>
        <p id="lookup-instructions">
          Ingresa tu código de confirmación y correo para ver tu pase de abordar o cambiar
          asientos.
        </p>
      </div>

      <form class="lookup-card" (submit)="submit($event)" novalidate aria-describedby="lookup-instructions">
        <div class="field">
          <label for="lookup-code">Código de reserva</label>
          <div class="field-control">
            <app-icon name="key" [size]="19" />
            <input
              id="lookup-code"
              autocomplete="off"
              maxlength="6"
              placeholder="Ej. KT8942"
              [value]="code()"
              (input)="code.set(value($event))"
              [attr.aria-invalid]="!!errors()['code']"
              aria-describedby="lookup-code-error"
            />
          </div>
          <span class="field-error" id="lookup-code-error">{{ errors()['code'] }}</span>
        </div>
        <div class="field">
          <label for="lookup-email">Correo del comprador</label>
          <div class="field-control">
            <app-icon name="mail" [size]="19" />
            <input
              id="lookup-email"
              type="email"
              autocomplete="email"
              placeholder="tu@correo.com"
              [value]="email()"
              (input)="email.set(value($event))"
              [attr.aria-invalid]="!!errors()['email']"
              aria-describedby="lookup-email-error"
            />
          </div>
          <span class="field-error" id="lookup-email-error">{{ errors()['email'] }}</span>
        </div>
        @if (error(); as message) {
          <p class="notice notice-danger" role="alert">{{ message }}</p>
        }
        <button class="btn" type="submit" [disabled]="busy()">
          {{ busy() ? 'Buscando…' : 'Consultar boleto' }}
        </button>
      </form>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .lookup-view {
      display: grid;
      min-height: calc(100vh - 8rem);
      place-content: center;
      gap: var(--space-6);
      margin: calc(var(--space-4) * -1);
      padding: var(--space-8) var(--space-4);
      background: #f8fafc;
    }
    .lookup-intro {
      max-width: 480px;
      text-align: center;
    }
    .ticket-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 4rem;
      height: 4rem;
      margin-bottom: var(--space-3);
      border-radius: 50%;
      color: var(--color-primary);
      background: var(--color-info-bg);
    }
    h2 {
      margin-bottom: var(--space-2);
      font-size: clamp(1.75rem, 5vw, 2.25rem);
      letter-spacing: -0.03em;
    }
    .lookup-intro p {
      max-width: 440px;
      margin: 0 auto;
      color: var(--color-text-muted);
    }
    .lookup-card {
      width: min(100%, 480px);
      padding: var(--space-6);
      background: var(--color-surface);
      border: 1px solid rgb(15 23 42 / 0.08);
      border-radius: 16px;
      box-shadow: 0 16px 36px -20px rgb(15 23 42 / 0.35), 0 4px 12px rgb(15 23 42 / 0.06);
    }
    .field-control {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      box-sizing: border-box;
      padding: 0 var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
    }
    .field-control app-icon {
      color: var(--color-text-muted);
      pointer-events: none;
    }
    .field-control input {
      flex: 1;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      padding-inline: 0;
      border: 0;
      outline: 0;
    }
    .field-control:focus-within {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 4px rgb(11 87 208 / 0.18);
    }
    #lookup-code {
      text-transform: uppercase;
    }
    .lookup-card .btn {
      width: 100%;
      margin-top: var(--space-2);
      transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
    }
    .lookup-card .btn:hover:not(:disabled) {
      box-shadow: 0 12px 20px -12px rgb(11 87 208 / 0.8);
      transform: translateY(-1px);
    }
    @media (max-width: 520px) {
      .lookup-view {
        min-height: calc(100vh - 7rem);
        padding: var(--space-6) var(--space-3);
      }
      .lookup-card {
        padding: var(--space-4);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .lookup-card .btn {
        transition: none;
      }
    }
  `,
})
export class BookingLookupComponent {
  readonly initialCode = input('');
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly lookup = output<BookingLookupRequest>();

  protected readonly code = linkedSignal(() => this.initialCode());
  protected readonly email = signal('');
  protected readonly errors = signal<FieldErrors>({});
  protected readonly value = inputValue;

  protected submit(event: Event): void {
    event.preventDefault();
    const result = validate(BookingLookupRequestSchema, { code: this.code(), email: this.email() });
    this.errors.set(result.errors);
    if (result.data !== null) {
      this.lookup.emit(result.data);
    }
  }
}
