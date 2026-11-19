/** Reloj inyectable (constitución, principio V): el dominio nunca llama a `new Date()`. */
export const CLOCK = Symbol('Clock');

export interface Clock {
  now(): Date;
}
