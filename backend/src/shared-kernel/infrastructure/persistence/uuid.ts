const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evita enviar a PostgreSQL un `::uuid` inválido, que respondería con un error genérico. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
