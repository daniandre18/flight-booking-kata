/**
 * Unidad de trabajo (research.md §3): una transacción compartida por los repositorios de
 * varios módulos. Los adaptadores se unen a la transacción activa sin recibirla por parámetro.
 */
export const UNIT_OF_WORK = Symbol('UnitOfWork');

export interface UnitOfWorkOptions {
  /** Por defecto `ReadCommitted`. Los snapshots de lectura usan `RepeatableRead`. */
  isolation?: 'ReadCommitted' | 'RepeatableRead';
  readOnly?: boolean;
}

export interface UnitOfWork {
  /** Ejecuta `work` en una transacción; si ya hay una activa, se une a ella. */
  run<T>(work: () => Promise<T>, options?: UnitOfWorkOptions): Promise<T>;
}
