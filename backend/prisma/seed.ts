/**
 * Seed determinista (research.md §22).
 * - 5 aeropuertos, 20 rutas dirigidas, 3 vuelos diarios por ruta durante 14 días desde hoy
 *   (Bogotá): 840 vuelos de 180 asientos.
 * - Un vuelo casi lleno (1 asiento libre) cuyos 179 asientos BOOKED pertenecen a reservas reales
 *   agrupadas de a 4 (44 de 4 y 1 de 3).
 * Mismo día → mismos datos: PRNG con semilla fija e identificadores UUID v5.
 *
 * Uso: `pnpm seed` (borra y regenera) o `tsx prisma/seed.ts --if-empty` (solo si no hay vuelos).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  allSeatPositions,
  formatSeatCode,
  toBogotaDate,
  type AirportCode,
  type SeatLetter,
} from '@kata/shared';
import { config as loadEnv } from 'dotenv';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';

loadEnv({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')], quiet: true });

const SEED_NAMESPACE = '6f1d3c2a-8b4e-4f5a-9c7d-1e2f3a4b5c6d';
const PRNG_SEED = 20261118;
const DAYS = 14;
const BOGOTA_UTC_OFFSET_HOURS = 5;
const SEAT_CHUNK = 5_000;

const AIRPORTS: Record<AirportCode, string> = {
  BOG: 'Bogotá',
  MDE: 'Medellín',
  CLO: 'Cali',
  CTG: 'Cartagena',
  BAQ: 'Barranquilla',
};

/**
 * Duración (minutos) y tarifa base (COP) por par de ciudades, sin importar el sentido.
 * La clave lleva los códigos en orden alfabético.
 */
const ROUTE_PROFILE: Record<string, { minutes: number; baseFare: number }> = {
  'BOG-MDE': { minutes: 55, baseFare: 210_000 },
  'BOG-CLO': { minutes: 60, baseFare: 230_000 },
  'BOG-CTG': { minutes: 85, baseFare: 320_000 },
  'BAQ-BOG': { minutes: 90, baseFare: 310_000 },
  'CLO-MDE': { minutes: 60, baseFare: 220_000 },
  'CTG-MDE': { minutes: 70, baseFare: 260_000 },
  'BAQ-MDE': { minutes: 70, baseFare: 255_000 },
  'CLO-CTG': { minutes: 100, baseFare: 340_000 },
  'BAQ-CLO': { minutes: 100, baseFare: 335_000 },
  'BAQ-CTG': { minutes: 40, baseFare: 160_000 },
};

/** Horas locales de salida (Bogotá). */
const DEPARTURE_SLOTS = [
  { hour: 6, minute: 0 },
  { hour: 12, minute: 30 },
  { hour: 18, minute: 45 },
];

/** Vuelo casi lleno: BOG → MDE, mañana, primer turno. Queda libre el 30F. */
const NEAR_FULL = { origin: 'BOG', destination: 'MDE', dayOffset: 1, slot: 0, freeSeat: '30F' };
const BOOKING_GROUP_SIZE = 4;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

interface FlightRow {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  scheduledDepartureAt: Date;
  departureAt: Date;
  arrivalAt: Date;
  fare: number;
}

/**
 * UUID v5 determinista a partir de un nombre. RFC 4122 define v5 con SHA-1: aquí solo se usa para
 * generar identificadores reproducibles, no con fines de seguridad.
 */
function uuidV5(name: string): string {
  const namespace = Buffer.from(SEED_NAMESPACE.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(namespace).update(name).digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** PRNG mulberry32: misma semilla → misma secuencia. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function routeProfile(origin: string, destination: string): { minutes: number; baseFare: number } {
  const key = [origin, destination].sort((a, b) => a.localeCompare(b)).join('-');
  const profile = ROUTE_PROFILE[key];
  if (profile === undefined) {
    throw new Error(`Ruta sin perfil: ${key}`);
  }
  return profile;
}

function bogotaDayStart(
  dayOffset: number,
  today: string,
): { year: number; month: number; day: number } {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function buildFlights(today: string, random: () => number): FlightRow[] {
  const codes = Object.keys(AIRPORTS) as AirportCode[];
  const routes = codes.flatMap((origin) =>
    codes
      .filter((destination) => destination !== origin)
      .map((destination) => ({ origin, destination })),
  );
  const flights: FlightRow[] = [];
  for (let dayOffset = 0; dayOffset < DAYS; dayOffset += 1) {
    const { year, month, day } = bogotaDayStart(dayOffset, today);
    routes.forEach((route, routeIndex) => {
      const profile = routeProfile(route.origin, route.destination);
      DEPARTURE_SLOTS.forEach((slot, slotIndex) => {
        const minuteOffset = (routeIndex * 5) % 30;
        const departure = new Date(
          Date.UTC(
            year,
            month,
            day,
            slot.hour + BOGOTA_UTC_OFFSET_HOURS,
            slot.minute + minuteOffset,
          ),
        );
        const flightNumber = `KT${1000 + routeIndex * 10 + slotIndex}`;
        const fare = Math.round((profile.baseFare * (0.85 + random() * 0.4)) / 100) * 100;
        flights.push({
          id: uuidV5(`${flightNumber}-${toBogotaDate(departure)}`),
          flightNumber,
          origin: route.origin,
          destination: route.destination,
          scheduledDepartureAt: departure,
          departureAt: departure,
          arrivalAt: new Date(departure.getTime() + profile.minutes * 60_000),
          fare,
        });
      });
    });
  }
  return flights;
}

function findNearFullFlight(flights: FlightRow[], today: string): FlightRow {
  const target = toBogotaDate(
    new Date(Date.parse(`${today}T12:00:00Z`) + NEAR_FULL.dayOffset * 86_400_000),
  );
  const candidates = flights
    .filter(
      (flight) =>
        flight.origin === NEAR_FULL.origin &&
        flight.destination === NEAR_FULL.destination &&
        toBogotaDate(flight.departureAt) === target,
    )
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());
  const flight = candidates[NEAR_FULL.slot];
  if (flight === undefined) {
    throw new Error('No se encontró el vuelo casi lleno');
  }
  return flight;
}

function uniqueCodes(count: number, random: () => number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
    }
    codes.add(code);
  }
  return [...codes];
}

interface SeatRow {
  id: string;
  flightId: string;
  row: number;
  letter: SeatLetter;
  status: 'AVAILABLE' | 'BOOKED';
}

function buildSeats(flights: FlightRow[], nearFull: FlightRow): SeatRow[] {
  const positions = allSeatPositions();
  return flights.flatMap((flight) =>
    positions.map(({ row, letter }) => {
      const code = formatSeatCode(row, letter);
      const booked = flight.id === nearFull.id && code !== NEAR_FULL.freeSeat;
      return {
        id: uuidV5(`${flight.id}-${code}`),
        flightId: flight.id,
        row,
        letter,
        status: booked ? ('BOOKED' as const) : ('AVAILABLE' as const),
      };
    }),
  );
}

function groupInChunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    groups.push(items.slice(start, start + size));
  }
  return groups;
}

/** Reservas reales para los asientos BOOKED del vuelo casi lleno, agrupadas de a 4. */
function buildBookings(seats: SeatRow[], nearFull: FlightRow, random: () => number) {
  const groups = groupInChunks(
    seats.filter((seat) => seat.flightId === nearFull.id && seat.status === 'BOOKED'),
    BOOKING_GROUP_SIZE,
  );
  const codes = uniqueCodes(groups.length, random);
  const bookings = groups.map((group, index) => ({
    id: uuidV5(`booking-${nearFull.id}-${index}`),
    code: codes[index] as string,
    flightId: nearFull.id,
    clientId: uuidV5(`seed-client-${index}`),
    buyerName: `Comprador Demo ${index + 1}`,
    buyerEmail: `demo${index + 1}@example.com`,
    total: nearFull.fare * group.length,
    cardBrand: 'VISA' as const,
    cardLast4: '4242',
  }));
  const bookingSeats = groups.flatMap((group, index) =>
    group.map((seat) => ({
      bookingId: bookings[index]?.id as string,
      seatId: seat.id,
      passengerName: `Pasajero ${formatSeatCode(seat.row, seat.letter)}`,
    })),
  );
  return { bookings, bookingSeats };
}

async function insertSeats(prisma: PrismaClient, seats: SeatRow[]): Promise<void> {
  // Inserción por lotes secuenciales: acota el tamaño de cada sentencia y la memoria.
  for (const chunk of groupInChunks(seats, SEAT_CHUNK)) {
    await prisma.seat.createMany({ data: chunk });
  }
}

async function seed(prisma: PrismaClient): Promise<void> {
  const random = createRandom(PRNG_SEED);
  const today = toBogotaDate(new Date());
  const flights = buildFlights(today, random);
  const nearFull = findNearFullFlight(flights, today);
  const seats = buildSeats(flights, nearFull);
  const { bookings, bookingSeats } = buildBookings(seats, nearFull, random);

  await prisma.$executeRaw`TRUNCATE flight_events, idempotency_keys, booking_seats, bookings, seats, flights, airports RESTART IDENTITY CASCADE`;
  await prisma.airport.createMany({
    data: Object.entries(AIRPORTS).map(([code, city]) => ({ code, city })),
  });
  await prisma.flight.createMany({ data: flights });
  await insertSeats(prisma, seats);
  await prisma.booking.createMany({ data: bookings });
  await prisma.bookingSeat.createMany({ data: bookingSeats });

  log(
    `Seed listo: ${flights.length} vuelos, ${seats.length} asientos, ${bookings.length} reservas.`,
  );
  log(
    `Vuelo casi lleno (1 asiento libre, ${NEAR_FULL.freeSeat}): ${nearFull.flightNumber} ` +
      `${nearFull.origin}→${nearFull.destination} ${nearFull.departureAt.toISOString()} id=${nearFull.id}`,
  );
  log(`Reserva de ejemplo: código ${bookings[0]?.code} / correo ${bookings[0]?.buyerEmail}`);
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === '') {
    throw new Error('DATABASE_URL es obligatoria para el seed');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (process.argv.includes('--if-empty') && (await prisma.flight.count()) > 0) {
      log('La base ya tiene vuelos: se omite el seed.');
      return;
    }
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`El seed falló: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
