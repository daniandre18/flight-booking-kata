import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  createCreateBookingRequestSchema,
  detectCardBrand,
  type CreateBookingRequest,
} from '@kata/shared';
import { inputValue, validate, type FieldErrors } from '../../shared/forms';

interface CheckoutFields {
  buyerName: string;
  buyerEmail: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
}

const EMPTY: CheckoutFields = {
  buyerName: '',
  buyerEmail: '',
  cardNumber: '',
  cardExpiry: '',
  cardCvv: '',
};

/**
 * Formulario de pago validado con `createCreateBookingRequestSchema` de shared (DRY; RUX-025,
 * RUX-027): comprador, un pasajero por código de asiento y tarjeta con la marca detectada. Los
 * errores aparecen junto a cada campo y lo escrito se conserva.
 */
@Component({
  selector: 'app-checkout-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-form.component.html',
  styles: `
    fieldset {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-3) var(--space-4);
      margin: 0 0 var(--space-4);
    }
    legend {
      font-weight: 700;
      padding: 0 var(--space-2);
    }
    .card-row {
      display: grid;
      gap: 0 var(--space-3);
      grid-template-columns: 1fr 1fr;
    }
    .brand {
      font-weight: 700;
    }
    button[type='submit'] {
      width: 100%;
    }
  `,
})
export class CheckoutFormComponent {
  readonly flightId = input.required<string>();
  readonly seatIds = input.required<string[]>();
  readonly processing = input(false);
  readonly disabled = input(false);
  readonly submitted = output<CreateBookingRequest>();

  protected readonly fields = signal<CheckoutFields>(EMPTY);
  protected readonly passengers = signal<Record<string, string>>({});
  protected readonly errors = signal<FieldErrors>({});
  protected readonly brand = computed(() => {
    const digits = this.fields().cardNumber.replace(/\D/g, '');
    return digits.length >= 4 ? detectCardBrand(digits) : null;
  });

  protected set(field: keyof CheckoutFields, event: Event): void {
    this.fields.update((current) => ({ ...current, [field]: inputValue(event) }));
  }

  protected setPassenger(seatId: string, event: Event): void {
    this.passengers.update((current) => ({ ...current, [seatId]: inputValue(event) }));
  }

  /** Índice del pasajero en la solicitud: los errores llegan como `passengers.<i>.name`. */
  protected passengerError(index: number): string | undefined {
    return this.errors()[`passengers.${index}.name`];
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const result = validate(createCreateBookingRequestSchema(), this.request());
    this.errors.set(result.errors);
    if (result.data !== null && !this.processing()) {
      this.submitted.emit(result.data);
    }
  }

  private request(): unknown {
    const fields = this.fields();
    return {
      flightId: this.flightId(),
      buyer: { name: fields.buyerName, email: fields.buyerEmail.trim() },
      passengers: this.seatIds().map((seatId) => ({
        seatId,
        name: this.passengers()[seatId] ?? '',
      })),
      card: {
        number: fields.cardNumber.replace(/\s/g, ''),
        expiry: fields.cardExpiry,
        cvv: fields.cardCvv,
      },
    };
  }
}
