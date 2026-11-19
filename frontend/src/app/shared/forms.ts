/** Forma mínima de un esquema zod de `@kata/shared` (el frontend no redefine validaciones). */
export interface SafeParser<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
      };
}

/** Primer mensaje por campo, con la ruta unida por puntos (`passengers.0.name`). */
export type FieldErrors = Readonly<Record<string, string>>;

export interface Validation<T> {
  data: T | null;
  errors: FieldErrors;
}

/**
 * Valida con el mismo esquema que usa el backend (principio III, DRY) y devuelve los errores por
 * campo para mostrarlos junto a cada uno (RUX-021, RUX-025).
 */
export function validate<T>(schema: SafeParser<T>, value: unknown): Validation<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { data: parsed.data, errors: {} };
  }
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join('.');
    errors[path] ??= issue.message;
  }
  return { data: null, errors };
}

/** Valor de un `<input>` o `<select>` desde su evento (plantillas sin `$any`). */
export function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
