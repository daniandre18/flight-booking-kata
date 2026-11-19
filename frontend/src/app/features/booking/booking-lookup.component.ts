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

/** Consulta del boleto con código y correo, validada con `BookingLookupRequestSchema` (DRY). */
@Component({
  selector: 'app-booking-lookup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="card" (submit)="submit($event)" novalidate aria-label="Consultar boleto">
      <div class="field">
        <label for="lookup-code">Código de reserva</label>
        <input
          id="lookup-code"
          autocomplete="off"
          maxlength="6"
          [value]="code()"
          (input)="code.set(value($event))"
          [attr.aria-invalid]="!!errors()['code']"
          aria-describedby="lookup-code-error"
        />
        <span class="field-error" id="lookup-code-error">{{ errors()['code'] }}</span>
      </div>
      <div class="field">
        <label for="lookup-email">Correo del comprador</label>
        <input
          id="lookup-email"
          type="email"
          autocomplete="email"
          [value]="email()"
          (input)="email.set(value($event))"
          [attr.aria-invalid]="!!errors()['email']"
          aria-describedby="lookup-email-error"
        />
        <span class="field-error" id="lookup-email-error">{{ errors()['email'] }}</span>
      </div>
      @if (error(); as message) {
        <p class="notice notice-danger" role="alert">{{ message }}</p>
      }
      <button class="btn" type="submit" [disabled]="busy()">
        {{ busy() ? 'Buscando…' : 'Consultar boleto' }}
      </button>
    </form>
  `,
  styles: `
    :host {
      display: block;
      max-width: 480px;
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
