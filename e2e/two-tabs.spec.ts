import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * Dos clientes reales en el navegador (T179, CE-002, CE-010). Cada contexto de navegador tiene su
 * propio `localStorage`, y por lo tanto su propio `clientId`, como dos ventanas de incógnito.
 */

interface FlightSummary {
  id: string;
  status: string;
  availableSeats: number;
}

interface SeatSummary {
  seatId: string;
  status: string;
}

const bogotaDate = (daysAhead: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
    new Date(Date.now() + daysAhead * 86_400_000),
  );

/** Un vuelo reservable y dos asientos libres (el seed es determinista; la base puede tener uso). */
async function pickFlight(api: APIRequestContext): Promise<{ flightId: string; seats: string[] }> {
  const query = `origin=BOG&destination=CTG&date=${bogotaDate(3)}`;
  const flights = (await (await api.get(`/api/flights?${query}`)).json()) as FlightSummary[];
  const flight = flights.find(
    (candidate) => candidate.status === 'SCHEDULED' && candidate.availableSeats > 10,
  );
  if (flight === undefined) {
    throw new Error('No hay un vuelo BOG → CTG reservable dentro de 3 días');
  }
  const snapshot = (await (await api.get(`/api/flights/${flight.id}/seats`)).json()) as {
    seats: SeatSummary[];
  };
  const free = snapshot.seats.filter((seat) => seat.status === 'AVAILABLE').map((s) => s.seatId);
  return { flightId: flight.id, seats: free.slice(-2) };
}

async function openMap(browser: Browser, flightId: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/flights/${flightId}/seats`);
  await expect(page.getByRole('status').filter({ hasText: 'Conectado' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Asiento 1A,/ })).toBeVisible();
  return page;
}

const seat = (page: Page, seatId: string) =>
  page.getByRole('button', { name: new RegExp(`^Asiento ${seatId},`) });

test('un bloqueo en una pestaña se ve en la otra en menos de 1 s', async ({ browser, request }) => {
  const { flightId, seats } = await pickFlight(request);
  const seatId = seats[0] as string;
  const first = await openMap(browser, flightId);
  const second = await openMap(browser, flightId);

  const startedAt = Date.now();
  await seat(first, seatId).click();
  await expect(seat(second, seatId)).toHaveAccessibleName(/bloqueado por otra persona/, {
    timeout: 1_000,
  });
  const elapsedMs = Date.now() - startedAt;

  await expect(seat(first, seatId)).toHaveAccessibleName(/seleccionado por ti/);
  test.info().annotations.push({ type: 'medición', description: `${elapsedMs} ms` });
  console.warn(`[medición] clic en una pestaña → visible en la otra: ${elapsedMs} ms`);
  expect(elapsedMs).toBeLessThan(1_000);

  await seat(first, seatId).click(); // libera para dejar la base como estaba
  await expect(seat(second, seatId)).toHaveAccessibleName(/disponible/);
});

test('clic simultáneo sobre el mismo asiento: gana exactamente una pestaña', async ({
  browser,
  request,
}) => {
  const { flightId, seats } = await pickFlight(request);
  const seatId = seats[1] as string;
  const first = await openMap(browser, flightId);
  const second = await openMap(browser, flightId);

  // `force`: dos clics a la vez. Sin él, Playwright espera a que el botón esté habilitado y, si el
  // evento del ganador llega antes, el asiento ya tiene `aria-disabled` y el clic espera para siempre.
  await Promise.all([
    seat(first, seatId).click({ force: true }),
    seat(second, seatId).click({ force: true }),
  ]);

  const mine = /seleccionado por ti/;
  const other = /bloqueado por otra persona/;
  await expect(async () => {
    const names = [
      await seat(first, seatId).getAttribute('aria-label'),
      await seat(second, seatId).getAttribute('aria-label'),
    ];
    expect(names.filter((name) => mine.test(name ?? ''))).toHaveLength(1);
    expect(names.filter((name) => other.test(name ?? ''))).toHaveLength(1);
  }).toPass({ timeout: 3_000 });

  const winner = mine.test((await seat(first, seatId).getAttribute('aria-label')) ?? '')
    ? first
    : second;
  await seat(winner, seatId).click(); // libera
});
