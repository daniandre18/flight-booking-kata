import { type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { allSeatPositions, type AirportCode, type FlightStatus } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
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
  /**
   * Usa el reloj del sistema en la app. `clock` queda fijo en el instante de arranque y solo
   * sirve para las fechas por defecto de `createFlight`.
   */
  realClock?: boolean;
  /** Vacía la base al arrancar (por defecto). `false` simula un reinicio con datos previos. */
  resetOnStart?: boolean;
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
  /** Escucha en un puerto libre (necesario para Socket.io) y devuelve la URL base. */
  listen(): Promise<string>;
  close(): Promise<void>;
}

/** Arranca la app completa contra la base de prueba con el reloj reemplazado por FakeClock. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const clock = options.clock ?? new FakeClock(options.realClock ? new Date() : undefined);
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
    HOLD_TTL_SECONDS: '600',
    // El barrido periódico no corre durante las pruebas (se dispara a mano con FakeClock); la
    // pasada de arranque sí. Las pruebas de expiración con reloj real lo bajan a 2000 ms.
    HOLD_SWEEP_INTERVAL_MS: '3600000',
    ...options.env,
  });

  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });
  const moduleRef = await (
    options.realClock ? builder : builder.overrideProvider(CLOCK).useValue(clock)
  ).compile();
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

  const listen = async (): Promise<string> => {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  };

  if (options.resetOnStart ?? true) {
    await reset();
  }
  return { app, clock, prisma, createFlight, reset, listen, close: () => app.close() };
}
