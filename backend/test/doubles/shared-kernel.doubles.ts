import type { FlightStatus } from '@kata/shared';
import type {
  DomainEvent,
  EventPublisher,
} from '../../src/shared-kernel/application/event-publisher';
import type {
  FlightEventDraft,
  FlightEventLog,
  RecordedFlightEvent,
} from '../../src/shared-kernel/application/flight-event-log.port';
import type {
  FlightStatsReader,
  FlightSummary,
} from '../../src/shared-kernel/application/flight-stats-reader.port';
import type { FlightWriteContext } from '../../src/shared-kernel/application/flight-write-context';
import type {
  FlightLockCondition,
  FlightWriteLock,
} from '../../src/shared-kernel/application/flight-write-lock.port';
import type { UnitOfWork } from '../../src/shared-kernel/application/unit-of-work';
import { DomainError } from '../../src/shared-kernel/domain/domain-error';
import { FakeClock } from '../support/fake-clock';

/** Estado que participa en la transacción en memoria: se guarda al empezar y se restaura si falla. */
export interface Transactional {
  snapshot(): unknown;
  restore(state: unknown): void;
}

/** UnitOfWork en memoria: ejecuta directo, registra commits y rollbacks y restaura el estado. */
export class InMemoryUnitOfWork implements UnitOfWork {
  commits = 0;
  rollbacks = 0;
  private active = false;
  private readonly participants: Transactional[] = [];

  enlist(participant: Transactional): void {
    this.participants.push(participant);
  }

  get isActive(): boolean {
    return this.active;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active) {
      return work();
    }
    const saved = this.participants.map((participant) => participant.snapshot());
    this.active = true;
    try {
      const result = await work();
      this.commits += 1;
      return result;
    } catch (error) {
      this.participants.forEach((participant, index) => participant.restore(saved[index]));
      this.rollbacks += 1;
      throw error;
    } finally {
      this.active = false;
    }
  }
}

export interface StubFlight {
  status: FlightStatus;
  departureAt: Date;
}

/** Lock del vuelo con las mismas condiciones y errores que el adaptador real. */
export class StubFlightWriteLock implements FlightWriteLock {
  readonly flights = new Map<string, StubFlight>();
  readonly acquired: { flightId: string; condition: FlightLockCondition }[] = [];

  constructor(
    private readonly uow: InMemoryUnitOfWork,
    private readonly eventLog: InMemoryFlightEventLog,
  ) {}

  setFlight(flightId: string, flight: StubFlight): void {
    this.flights.set(flightId, flight);
  }

  acquire(flightId: string, condition: FlightLockCondition, now: Date): Promise<number> {
    if (!this.uow.isActive) {
      return Promise.reject(new Error('Escritura fuera de una UnitOfWork'));
    }
    const flight = this.flights.get(flightId);
    if (flight === undefined) {
      return Promise.reject(new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe'));
    }
    const failure = conditionFailure(flight, condition, now);
    if (failure !== null) {
      return Promise.reject(failure);
    }
    this.acquired.push({ flightId, condition });
    return Promise.resolve(this.eventLog.seqOf(flightId));
  }
}

function conditionFailure(
  flight: StubFlight,
  condition: FlightLockCondition,
  now: Date,
): DomainError | null {
  const bookable =
    (flight.status === 'SCHEDULED' || flight.status === 'DELAYED') && flight.departureAt > now;
  if (condition === 'bookable' && !bookable) {
    return new DomainError('FLIGHT_NOT_BOOKABLE', 'El vuelo no admite bloqueos ni reservas');
  }
  if (condition === 'notCancelled' && flight.status === 'CANCELLED') {
    return new DomainError('FLIGHT_STATUS_CONFLICT', 'El vuelo ya está cancelado');
  }
  return null;
}

/** Registro de eventos en memoria con `seq` consecutivas por vuelo; participa en el rollback. */
export class InMemoryFlightEventLog implements FlightEventLog, Transactional {
  events: RecordedFlightEvent[] = [];
  private seqs = new Map<string, number>();

  seqOf(flightId: string): number {
    return this.seqs.get(flightId) ?? 0;
  }

  append(flightId: string, drafts: readonly FlightEventDraft[]): Promise<RecordedFlightEvent[]> {
    const first = this.seqOf(flightId) + 1;
    const recorded = drafts.map((draft, index) => ({ ...draft, flightId, seq: first + index }));
    this.seqs.set(flightId, first + drafts.length - 1);
    this.events.push(...recorded);
    return Promise.resolve(recorded);
  }

  snapshot(): unknown {
    return { events: [...this.events], seqs: new Map(this.seqs) };
  }

  restore(state: unknown): void {
    const saved = state as { events: RecordedFlightEvent[]; seqs: Map<string, number> };
    this.events = saved.events;
    this.seqs = saved.seqs;
  }
}

/** Resumen configurable; por defecto usa el `seq` del registro y contadores vacíos. */
export class StubFlightStatsReader implements FlightStatsReader {
  summaries = new Map<string, Omit<FlightSummary, 'seq'>>();

  constructor(private readonly eventLog: InMemoryFlightEventLog) {}

  summary(flightId: string): Promise<FlightSummary | null> {
    const base = this.summaries.get(flightId);
    return Promise.resolve(base ? { ...base, seq: this.eventLog.seqOf(flightId) } : null);
  }
}

/** Publicador que guarda los eventos para inspeccionarlos. */
export class RecordingEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  publish(events: readonly DomainEvent[]): void {
    this.published.push(...events);
  }
}

export interface FlightWriteDoubles {
  context: FlightWriteContext;
  uow: InMemoryUnitOfWork;
  writeLock: StubFlightWriteLock;
  eventLog: InMemoryFlightEventLog;
  statsReader: StubFlightStatsReader;
  publisher: RecordingEventPublisher;
  clock: FakeClock;
}

export function buildFlightWriteContext(clock = new FakeClock()): FlightWriteDoubles {
  const uow = new InMemoryUnitOfWork();
  const eventLog = new InMemoryFlightEventLog();
  uow.enlist(eventLog);
  const writeLock = new StubFlightWriteLock(uow, eventLog);
  const statsReader = new StubFlightStatsReader(eventLog);
  const publisher = new RecordingEventPublisher();
  const context = { uow, writeLock, eventLog, statsReader, publisher, clock };
  return { context, uow, writeLock, eventLog, statsReader, publisher, clock };
}
