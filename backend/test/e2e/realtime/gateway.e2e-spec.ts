import { SeatHeldEventSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { holderTagOf } from '../../../src/shared-kernel/domain/holder-tag';
import {
  closeSockets,
  collect,
  connectSocket,
  joinFlight,
  settle,
  waitForEvent,
  type TestSocket,
} from '../support/sockets';
import { createTestApp, type TestApp } from '../support/test-app';

/** Emite un evento arbitrario, como haría un cliente malicioso (fuera del contrato tipado). */
function emitRaw(socket: TestSocket, event: string, payload: unknown): void {
  (socket as unknown as { emit: (name: string, data: unknown) => void }).emit(event, payload);
}

describe('RealtimeGateway (principios II y X, contracts/realtime-events.md)', () => {
  let ctx: TestApp;
  let baseUrl: string;
  const hold = (flightId: string, seatId: string, clientId: string) =>
    request(ctx.app.getHttpServer())
      .post(`/api/flights/${flightId}/seats/${seatId}/hold`)
      .set('X-Client-Id', clientId);

  beforeAll(async () => {
    ctx = await createTestApp();
    baseUrl = await ctx.listen();
  });

  beforeEach(() => ctx.reset());

  afterEach(() => closeSockets());

  afterAll(async () => {
    await ctx.close();
  });

  it('rechaza el handshake sin clientId v4 con CLIENT_ID_REQUIRED', async () => {
    await expect(connectSocket(baseUrl, null)).rejects.toThrow('CLIENT_ID_REQUIRED');
    await expect(connectSocket(baseUrl, 'no-es-uuid')).rejects.toThrow('CLIENT_ID_REQUIRED');
    // UUID v1: válido como UUID pero no v4.
    await expect(connectSocket(baseUrl, '6fa459ea-ee8a-11ec-8ea0-0242ac120002')).rejects.toThrow(
      'CLIENT_ID_REQUIRED',
    );
  });

  it('flight:join responde con la seq actual y valida el payload', async () => {
    const flightId = await ctx.createFlight();
    await hold(flightId, '1A', randomUUID()).expect(201);
    const socket = await connectSocket(baseUrl);
    await expect(joinFlight(socket, flightId)).resolves.toEqual({ ok: true, seq: 1 });
    await expect(
      socket.timeout(2_000).emitWithAck('flight:join', { flightId: 'x' }),
    ).resolves.toEqual({ ok: false, code: 'VALIDATION_ERROR' });
    await expect(joinFlight(socket, randomUUID())).resolves.toEqual({
      ok: false,
      code: 'FLIGHT_NOT_FOUND',
    });
  });

  it('un evento de estado emitido por un cliente no llega a nadie', async () => {
    const flightId = await ctx.createFlight();
    const attacker = await connectSocket(baseUrl);
    const victim = await connectSocket(baseUrl);
    await joinFlight(attacker, flightId);
    await joinFlight(victim, flightId);
    const received = collect(victim, 'seat:held');
    emitRaw(attacker, 'seat:held', { flightId, seatId: '1A', status: 'HELD', seq: 99 });
    await settle();
    expect(received).toEqual([]);
    expect(await ctx.prisma.seat.count({ where: { flightId, status: 'HELD' } })).toBe(0);
  });

  it('difunde seat:held con el contrato completo y nunca el clientId', async () => {
    const flightId = await ctx.createFlight();
    const clientId = randomUUID();
    const observer = await connectSocket(baseUrl);
    await joinFlight(observer, flightId);
    const next = waitForEvent(observer, 'seat:held');
    const response = await hold(flightId, '12C', clientId).expect(201);
    const event = await next;
    expect(SeatHeldEventSchema.strict().parse(event)).toEqual({
      flightId,
      seatId: '12C',
      status: 'HELD',
      seq: 1,
      occurredAt: ctx.clock.now().toISOString(),
      holdExpiresAt: response.body.holdExpiresAt,
      holderTag: holderTagOf(clientId),
    });
    expect(JSON.stringify(event)).not.toContain(clientId);
  });

  it('flight:stats va solo al room search; el room del vuelo recibe solo eventos con seq', async () => {
    const flightId = await ctx.createFlight();
    const inFlight = await connectSocket(baseUrl);
    const inSearch = await connectSocket(baseUrl);
    await joinFlight(inFlight, flightId);
    await inSearch.timeout(2_000).emitWithAck('search:subscribe', {});
    const statsInFlight = collect(inFlight, 'flight:stats');
    const heldInSearch = collect(inSearch, 'seat:held');
    const stats = waitForEvent(inSearch, 'flight:stats');
    await hold(flightId, '5D', randomUUID()).expect(201);
    await expect(stats).resolves.toMatchObject({
      flightId,
      seq: 1,
      availableSeats: 179,
      stats: { available: 179, held: 1, booked: 0, total: 180 },
    });
    await settle();
    expect(statsInFlight).toEqual([]);
    expect(heldInSearch).toEqual([]);
  });

  it('ningún evento llega antes del commit: al recibirlo, el cambio ya es visible en la base', async () => {
    const flightId = await ctx.createFlight();
    const observer = await connectSocket(baseUrl);
    await joinFlight(observer, flightId);
    const visibleOnArrival = new Promise<string | undefined>((resolve) => {
      observer.once('seat:held', () => {
        void ctx.prisma.seat
          .findFirst({ where: { flightId, row: 20, letter: 'B' } })
          .then((seat) => resolve(seat?.status));
      });
    });
    await hold(flightId, '20B', randomUUID()).expect(201);
    await expect(visibleOnArrival).resolves.toBe('HELD');
  });

  it('un rechazo (409) no difunde nada', async () => {
    const flightId = await ctx.createFlight();
    await hold(flightId, '8A', randomUUID()).expect(201);
    const observer = await connectSocket(baseUrl);
    await joinFlight(observer, flightId);
    const received = collect(observer, 'seat:held');
    await hold(flightId, '8A', randomUUID()).expect(409);
    await settle();
    expect(received).toEqual([]);
  });

  it('un segundo socket recibe seat:held en menos de 1 s desde la respuesta 201 (CE-002)', async () => {
    const flightId = await ctx.createFlight();
    const other = await connectSocket(baseUrl);
    await joinFlight(other, flightId);
    let arrivedAt = 0;
    const arrival = waitForEvent(other, 'seat:held').then(() => {
      arrivedAt = performance.now();
    });
    const sentAt = performance.now();
    await hold(flightId, '30A', randomUUID()).expect(201);
    const respondedAt = performance.now();
    await arrival;
    // El evento se publica tras el commit y antes de escribir la respuesta: suele llegar antes.
    expect(arrivedAt - respondedAt).toBeLessThan(1_000);
    const commandToEventMs = arrivedAt - sentAt;
    expect(commandToEventMs).toBeLessThan(1_000);
    process.stdout.write(
      `[medición] POST /hold → seat:held en otro socket: ${commandToEventMs.toFixed(1)} ms ` +
        `(respuesta 201 a los ${(respondedAt - sentAt).toFixed(1)} ms)\n`,
    );
  });

  it('flight:leave saca al socket del room', async () => {
    const flightId = await ctx.createFlight();
    const socket = await connectSocket(baseUrl);
    await joinFlight(socket, flightId);
    await expect(socket.timeout(2_000).emitWithAck('flight:leave', { flightId })).resolves.toEqual({
      ok: true,
    });
    const received = collect(socket, 'seat:held');
    await hold(flightId, '2C', randomUUID()).expect(201);
    await settle();
    expect(received).toEqual([]);
  });
});
