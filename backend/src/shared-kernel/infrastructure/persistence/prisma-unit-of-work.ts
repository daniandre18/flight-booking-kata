import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '../../../generated/prisma/client';
import { type UnitOfWork, type UnitOfWorkOptions } from '../../application/unit-of-work';
import { PrismaService } from './prisma.service';

export type DbClient = Prisma.TransactionClient;

/**
 * Transacción interactiva compartida por contexto asíncrono (research.md §3). Los repositorios
 * obtienen el cliente activo con `currentTx()` (lecturas) o `requireTx()` (escrituras).
 */
@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  private readonly storage = new AsyncLocalStorage<DbClient>();

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(work: () => Promise<T>, options: UnitOfWorkOptions = {}): Promise<T> {
    if (this.storage.getStore() !== undefined) {
      return work();
    }
    return this.prisma.$transaction(
      async (tx) => {
        if (options.readOnly === true) {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        }
        return this.storage.run(tx, work);
      },
      {
        isolationLevel:
          options.isolation === 'RepeatableRead'
            ? Prisma.TransactionIsolationLevel.RepeatableRead
            : Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }

  /** Cliente de la transacción activa o, si no hay, el cliente base (solo para lecturas). */
  currentTx(): DbClient {
    return this.storage.getStore() ?? this.prisma;
  }

  /** Cliente de la transacción activa; las escrituras fuera de una unidad de trabajo son un bug. */
  requireTx(): DbClient {
    const tx = this.storage.getStore();
    if (tx === undefined) {
      throw new Error('Escritura fuera de una UnitOfWork: envuelve el caso de uso en run()');
    }
    return tx;
  }
}
