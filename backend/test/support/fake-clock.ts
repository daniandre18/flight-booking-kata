import { type Clock } from '../../src/shared-kernel/domain/clock';

/** Reloj controlable para pruebas unitarias y e2e (constitución, principio V). */
export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date = new Date('2026-11-18T15:00:00.000Z')) {
    this.current = new Date(initial.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(instant: Date): void {
    this.current = new Date(instant.getTime());
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
