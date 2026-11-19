import { type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { allSeatPositions, type AirportCode, type FlightStatus } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/app.setup';
import { CLOCK } from '../../../src/shared-kernel/domain/clock';
import { PrismaService } from '../../../src/shared-kernel/infrastructure/persistence/prisma.service';
import { FakeClock } from '../../support/fake-clock';

export const TEST_ADMIN_KEY = 'test-admin-key';

const AIRPORTS: Record<AirportCode, string> = {
  BOG: 'Bogotá',
  MDE: 'Medellín',
  CLO: 'Cali',
  CTG: 'Cartagena',
  BAQ: 'Barranquilla',
};

export interface FlightOverrides {
  origin?: AirportCode;
  destination?: AirportCode;
  departureAt?: Date;
  durationMinutes?: number;
  fare?: number;
  status?: FlightStatus;
  flightNumber?: string;
}

export interface TestAppOptions {
  clock?: FakeClock;
  /** Controladores extra solo para la prueba (por ejemplo, sondas del throttler). */
  controllers?: Type[];
  /** Variables de entorno que sobrescriben las del arnés. */
  env?: Record<string, string>;
}

export interface TestApp {
  app: NestExpressApplication;
  clock: FakeClock;
  prisma: PrismaService;
  /** Crea un vuelo con sus 180 asientos disponibles y devuelve su id. */
  createFlight(overrides?: FlightOverrides): Promise<string>;
  /** Vacía todas las tablas de negocio y vuelve a crear los aeropuertos. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** Arranca la app completa contra la base de prueba con el reloj reemplazado por FakeClock. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const clock = options.clock ?? new FakeClock();
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new Error('TEST_DATABASE_URL no está definida (la define global-setup)');
  }
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    DB_POOL_MAX: '20',
    ADMIN_KEY: TEST_ADMIN_KEY,
    // E2E_LOG_LEVEL=error muestra los errores de la api al depurar una prueba.
    LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'silent',
    // Los límites de solicitudes se relajan salvo en las pruebas que los verifican.
    RATE_LIMIT_MULTIPLIER: '100',
    ...options.env,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);

  const reset = async (): Promise<void> => {
    await prisma.$executeRaw`TRUNCATE flight_events, idempotency_keys, booking_seats, bookings, seats, flights, airports RESTART IDENTITY CASCADE`;
    await prisma.airport.createMany({
      data: Object.entries(AIRPORTS).map(([code, city]) => ({ code, city })),
    });
  };

  const createFlight = async (overrides: FlightOverrides = {}): Promise<string> => {
    const id = randomUUID();
    const departureAt = overrides.departureAt ?? new Date(clock.now().getTime() + 24 * 3_600_000);
    const durationMinutes = overrides.durationMinutes ?? 60;
    await prisma.flight.create({
      data: {
        id,
        flightNumber: overrides.flightNumber ?? `T${id.slice(0, 5).toUpperCase()}`,
        origin: overrides.origin ?? 'BOG',
        destination: overrides.destination ?? 'MDE',
        scheduledDepartureAt: departureAt,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + durationMinutes * 60_000),
        fare: overrides.fare ?? 250_000,
        status: overrides.status ?? 'SCHEDULED',
      },
    });
    await prisma.seat.createMany({
      data: allSeatPositions().map(({ row, letter }) => ({ flightId: id, row, letter })),
    });
    return id;
  };

  await reset();
  return { app, clock, prisma, createFlight, reset, close: () => app.close() };
}
