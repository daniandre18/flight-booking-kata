import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DomainError } from '../../domain/domain-error';
import {
  type FlightLockCondition,
  type FlightWriteLock,
} from '../../application/flight-write-lock.port';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { isUuid } from './uuid';

/**
 * Bloquea la fila del vuelo con un UPDATE condicional que no avanza `seq` (research.md §6).
 * La condición y el lock son una sola sentencia: no hay lectura previa que decida.
 */
@Injectable()
export class PrismaFlightWriteLock implements FlightWriteLock {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async acquire(flightId: string, condition: FlightLockCondition, now: Date): Promise<number> {
    if (!isUuid(flightId)) {
      throw flightNotFound();
    }
    const tx = this.uow.requireTx();
    const rows = await tx.$queryRaw<{ seq: bigint }[]>`
      UPDATE flights SET seq = seq
      WHERE id = ${flightId}::uuid AND ${conditionSql(condition, now)}
      RETURNING seq`;
    const locked = rows[0];
    if (locked !== undefined) {
      return Number(locked.seq);
    }
    // Sin fila: solo se averigua el motivo para elegir el código de error.
    const exists = await tx.$queryRaw<{ found: number }[]>`
      SELECT 1 AS found FROM flights WHERE id = ${flightId}::uuid`;
    if (exists.length === 0) {
      throw flightNotFound();
    }
    throw condition === 'bookable'
      ? new DomainError('FLIGHT_NOT_BOOKABLE', 'El vuelo no admite bloqueos ni reservas')
      : new DomainError('FLIGHT_STATUS_CONFLICT', 'El vuelo ya está cancelado');
  }
}

function conditionSql(condition: FlightLockCondition, now: Date): Prisma.Sql {
  switch (condition) {
    case 'bookable':
      return Prisma.sql`status IN ('SCHEDULED', 'DELAYED') AND departure_at > ${now}`;
    case 'notCancelled':
      return Prisma.sql`status <> 'CANCELLED'`;
    case 'any':
      return Prisma.sql`TRUE`;
  }
}

function flightNotFound(): DomainError {
  return new DomainError('FLIGHT_NOT_FOUND', 'El vuelo no existe');
}
