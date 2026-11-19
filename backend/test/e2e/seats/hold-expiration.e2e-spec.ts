import { SeatReleasedEventSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { HoldSweeperJob } from '../../../src/seats/infrastructure/hold-sweeper.job';
import { holdSeats } from '../support/bookings';
import { closeSockets, collect, connectSocket, joinFlight, waitForEvent } from '../support/sockets';
import { createTestApp, type TestApp } from '../support/test-app';
import { FakeClock } from '../../support/fake-clock';

const TTL_MS = 600_000;

async function seatStatuses(ctx: TestApp, flightId: string, codes: string[]): Promise<string[]> {
  const seats = await ctx.prisma.seat.findMany({ where: { flightId } });
  return codes.map((code) => {
    const seat = seats.find((candidate) => `${candidate.row}${candidate.letter}` === code);
    return seat?.status ?? 'MISSING';
  });
}

describe('Expiración de bloqueos (HU2, RF-012, CE-003)', () => {
  describe('con reloj falso', () => {
    let ctx: TestApp;
    let baseUrl: string;

    beforeAll(async () => {
      ctx = await createTestApp();
      baseUrl = await ctx.listen();
    });

    beforeEach(() => ctx.reset());

    afterEach(() => closeSockets());

    afterAll(async () => {
      await ctx.close();
    });

    it('una pasada libera los vencidos, emite EXPIRED con seq consecutivas y actualiza stats', async () => {
      const flightId = await ctx.createFlight();
      const clientId = randomUUID();
      await holdSeats(ctx, flightId, clientId, ['12C', '12D']);
      const observer = await connectSocket(baseUrl);
      const search = await connectSocket(baseUrl);
      await expect(joinFlight(observer, flightId)).resolves.toEqual({ ok: true, seq: 2 });
      await search.timeout(2_000).emitWithAck('search:subscribe', {});
      const released = collect(observer, 'seat:released');
      const stats = waitForEvent(search, 'flight:stats', (event) => event.flightId === flightId);

      ctx.clock.advance(TTL_MS + 1_000);
      await ctx.app.get(HoldSweeperJob).sweep();

      const statsEvent = await stats;
      expect(released.map((event) => SeatReleasedEventSchema.parse(event))).toEqual([
        expect.objectContaining({ seatId: '12C', reason: 'EXPIRED', seq: 3 }),
        expect.objectContaining({ seatId: '12D', reason: 'EXPIRED', seq: 4 }),
      ]);
      expect(statsEvent).toMatchObject({
        seq: 4,
        availableSeats: 180,
        stats: { available: 180, held: 0, booked: 0, total: 180 },
      });
      expect(await seatStatuses(ctx, flightId, ['12C', '12D'])).toEqual(['AVAILABLE', 'AVAILABLE']);
    });

    it('no toca los bloqueos vigentes', async () => {
      const flightId = await ctx.createFlight();
      await holdSeats(ctx, flightId, randomUUID(), ['1A']);
      ctx.clock.advance(TTL_MS - 1_000);
      await ctx.app.get(HoldSweeperJob).sweep();
      expect(await seatStatuses(ctx, flightId, ['1A'])).toEqual(['HELD']);
      expect(await ctx.prisma.flightEvent.count({ where: { flightId } })).toBe(1);
    });

    it('tras la pasada otro cliente bloquea el asiento liberado', async () => {
      const flightId = await ctx.createFlight();
      await holdSeats(ctx, flightId, randomUUID(), ['7B']);
      ctx.clock.advance(TTL_MS);
      await ctx.app.get(HoldSweeperJob).sweep();
      await request(ctx.app.getHttpServer())
        .post(`/api/flights/${flightId}/seats/7B/hold`)
        .set('X-Client-Id', randomUUID())
        .expect(201);
    });
  });

  describe('reinicio con bloqueos', () => {
    it('al arrancar, el barrido corre una vez y libera los vencidos durante la caída', async () => {
      const clock = new FakeClock();
      const first = await createTestApp({ clock });
      const flightId = await first.createFlight();
      await holdSeats(first, flightId, randomUUID(), ['3A', '3B']);
      await holdSeats(first, flightId, randomUUID(), ['9F']);
      await first.close();

      clock.advance(TTL_MS + 5_000);
      const restarted = await createTestApp({ clock, resetOnStart: false });
      try {
        expect(await seatStatuses(restarted, flightId, ['3A', '3B', '9F'])).toEqual([
          'AVAILABLE',
          'AVAILABLE',
          'AVAILABLE',
        ]);
        const events = await restarted.prisma.flightEvent.findMany({
          where: { flightId, type: 'SEAT_RELEASED' },
          orderBy: { seq: 'asc' },
        });
        expect(events.map((event) => [Number(event.seq), event.seatCode])).toEqual([
          [4, '3A'],
          [5, '3B'],
          [6, '9F'],
        ]);
        expect(
          events.every((event) => (event.payload as { reason?: string }).reason === 'EXPIRED'),
        ).toBe(true);
      } finally {
        await restarted.close();
      }
    });
  });

  describe('con reloj real y barrido cada 2000 ms', () => {
    let ctx: TestApp;
    let baseUrl: string;

    beforeAll(async () => {
      ctx = await createTestApp({
        realClock: true,
        env: { HOLD_TTL_SECONDS: '2', HOLD_SWEEP_INTERVAL_MS: '2000' },
      });
      baseUrl = await ctx.listen();
    });

    afterAll(async () => {
      closeSockets();
      await ctx.close();
    });

    it('el evento EXPIRED llega a un socket suscrito en ≤ 3 s tras el vencimiento', async () => {
      const flightId = await ctx.createFlight();
      const observer = await connectSocket(baseUrl);
      await joinFlight(observer, flightId);
      const response = await request(ctx.app.getHttpServer())
        .post(`/api/flights/${flightId}/seats/15E/hold`)
        .set('X-Client-Id', randomUUID())
        .expect(201);
      const expiresAt = new Date(response.body.holdExpiresAt as string).getTime();

      const event = await waitForEvent(
        observer,
        'seat:released',
        (payload) => payload.seatId === '15E',
        8_000,
      );
      const lagMs = Date.now() - expiresAt;

      expect(event.reason).toBe('EXPIRED');
      expect(lagMs).toBeLessThanOrEqual(3_000);
      // Visible en la salida de la prueba para anotar el tiempo medido (README § Tiempos medidos).
      process.stdout.write(`[medición] vencimiento → seat:released EXPIRED: ${lagMs} ms\n`);
    });
  });
});
