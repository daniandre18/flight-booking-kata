import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { APP_CONFIG, type AppConfig } from '../config';

/** Espera máxima por conexión y duración máxima de una transacción interactiva (research.md §4). */
export const TRANSACTION_MAX_WAIT_MS = 10_000;
export const TRANSACTION_TIMEOUT_MS = 10_000;

/**
 * Cliente Prisma 7 con el adaptador pg. El pool lo define el adaptador (`max`), no la URL:
 * las escrituras de un vuelo se serializan y 100 solicitudes simultáneas deben esperar sin fallar.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        max: config.dbPoolMax,
        connectionTimeoutMillis: TRANSACTION_MAX_WAIT_MS,
      }),
      transactionOptions: { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
