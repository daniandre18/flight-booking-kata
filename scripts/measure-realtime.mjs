// Mediciones de tiempos (README § Tiempos medidos) contra el stack de docker compose.
// Uso: node scripts/measure-realtime.mjs <flightId> [expiry]
//   BASE_URL (por defecto http://localhost:8080) y ADMIN_KEY (por defecto demo-admin-key).
//   `expiry` mide CE-003 y requiere la api con HOLD_TTL_SECONDS corto (por ejemplo 5).
// Usa socket.io-client de backend/ (dependencia de desarrollo de las pruebas e2e).
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'demo-admin-key';
const [flightId, mode] = process.argv.slice(2);
const now = () => performance.now();

function connect(clientId = randomUUID(), options = {}) {
  const socket = io(`${BASE}/realtime`, {
    auth: { clientId },
    transports: ['websocket'],
    forceNew: true,
    ...options,
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const join = (socket, id) => socket.timeout(3000).emitWithAck('flight:join', { flightId: id });
const once = (socket, event, predicate = () => true, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    const listener = (payload) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, listener);
        resolve(payload);
      }
    };
    socket.on(event, listener);
  });

const hold = (id, seat, clientId) =>
  fetch(`${BASE}/api/flights/${id}/seats/${seat}/hold`, {
    method: 'POST',
    headers: { 'X-Client-Id': clientId },
  });
const release = (id, seat, clientId) =>
  fetch(`${BASE}/api/flights/${id}/seats/${seat}/hold`, {
    method: 'DELETE',
    headers: { 'X-Client-Id': clientId },
  });

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  return `n=${sorted.length} p50=${pick(50).toFixed(1)} ms p95=${pick(95).toFixed(1)} ms máx=${sorted.at(-1).toFixed(1)} ms`;
}

async function holdPropagation() {
  const observer = await connect();
  await join(observer, flightId);
  const samples = [];
  for (let i = 1; i <= 20; i += 1) {
    const clientId = randomUUID();
    const seat = `${i + 1}A`;
    const arrival = once(observer, 'seat:held', (event) => event.seatId === seat);
    const start = now();
    const response = await hold(flightId, seat, clientId);
    if (response.status !== 201) throw new Error(`hold ${seat}: ${response.status}`);
    await arrival;
    samples.push(now() - start);
    await release(flightId, seat, clientId);
  }
  observer.close();
  return samples;
}

async function flightChangePropagation() {
  const search = await connect();
  await search.timeout(3000).emitWithAck('search:subscribe', {});
  const samples = [];
  const flight = await (await fetch(`${BASE}/api/flights/${flightId}`)).json();
  let departure = new Date(flight.departureAt).getTime();
  for (let i = 0; i < 10; i += 1) {
    departure += 5 * 60_000;
    const arrival = once(
      search,
      'flight:stats',
      (event) => event.flightId === flightId && event.change === 'DELAYED',
    );
    const start = now();
    const response = await fetch(`${BASE}/api/admin/flights/${flightId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
      body: JSON.stringify({
        status: 'DELAYED',
        newDepartureAt: new Date(departure).toISOString(),
      }),
    });
    if (response.status !== 200) throw new Error(`delay: ${response.status}`);
    await arrival;
    samples.push(now() - start);
  }
  search.close();
  return samples;
}

/** Reconexión → re-join → snapshot con la seq vigente (lo que hace el mapa al volver la red). */
async function resync() {
  const samples = [];
  for (let i = 0; i < 10; i += 1) {
    const socket = await connect();
    await join(socket, flightId);
    socket.disconnect();
    const clientId = randomUUID();
    await hold(flightId, `${20 + i}F`, clientId); // cambio que el cliente desconectado se pierde
    const start = now();
    socket.connect();
    await once(socket, 'connect');
    const ack = await join(socket, flightId);
    const snapshot = await (await fetch(`${BASE}/api/flights/${flightId}/seats`)).json();
    if (snapshot.seq < ack.seq) throw new Error('snapshot viejo');
    const seat = snapshot.seats.find((candidate) => candidate.seatId === `${20 + i}F`);
    if (seat.status !== 'HELD') throw new Error('el snapshot no trae el cambio perdido');
    samples.push(now() - start);
    socket.close();
    await release(flightId, `${20 + i}F`, clientId);
  }
  return samples;
}

/** Con HOLD_TTL_SECONDS corto: vencimiento → seat:released EXPIRED en otro cliente. */
async function expiry() {
  const observer = await connect();
  await join(observer, flightId);
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const seat = `${10 + i}B`;
    const response = await hold(flightId, seat, randomUUID());
    const body = await response.json();
    const event = await once(
      observer,
      'seat:released',
      (payload) => payload.seatId === seat,
      15_000,
    );
    if (event.reason !== 'EXPIRED') throw new Error('motivo inesperado');
    samples.push(Date.now() - new Date(body.holdExpiresAt).getTime());
  }
  observer.close();
  return samples;
}

if (flightId === undefined) {
  console.error('Uso: node scripts/measure-realtime.mjs <flightId> [expiry]');
  process.exit(1);
}

(async () => {
  if (mode === 'expiry') {
    console.log(`CE-003 vencimiento → seat:released (EXPIRED): ${stats(await expiry())}`);
  } else {
    console.log(
      `CE-002/CE-010 POST /hold → seat:held en otro cliente: ${stats(await holdPropagation())}`,
    );
    console.log(
      `CE-002 PATCH retraso → flight:stats en el room search: ${stats(await flightChangePropagation())}`,
    );
    console.log(`CE-008 reconexión → re-join + snapshot al día: ${stats(await resync())}`);
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
