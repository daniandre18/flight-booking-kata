import { Controller, HttpCode, Post } from '@nestjs/common';
import { ErrorResponseSchema } from '@kata/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  HoldsThrottle,
  LookupThrottle,
  RATE_LIMITS,
} from '../../../src/shared-kernel/infrastructure/http/rate-limits';
import { createTestApp, type TestApp } from '../support/test-app';

/** Sondas con los mismos límites que usarán las rutas reales. */
@Controller('probe')
class RateLimitProbeController {
  @Post('holds')
  @HttpCode(204)
  @HoldsThrottle()
  holds(): void {}

  @Post('lookup')
  @HttpCode(204)
  @LookupThrottle()
  lookup(): void {}
}

describe('Límite de solicitudes (principio X)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp({
      controllers: [RateLimitProbeController],
      env: { RATE_LIMIT_MULTIPLIER: '1' },
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('limita por cliente y responde 429 con el formato único y Retry-After', async () => {
    const server = ctx.app.getHttpServer();
    const clientA = randomUUID();
    for (let i = 0; i < RATE_LIMITS.holds.client.limit; i += 1) {
      await request(server).post('/api/probe/holds').set('X-Client-Id', clientA).expect(204);
    }
    const blocked = await request(server)
      .post('/api/probe/holds')
      .set('X-Client-Id', clientA)
      .expect(429);
    expect(ErrorResponseSchema.parse(blocked.body)).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Demasiados intentos, espera un momento.',
      details: null,
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    await request(server).post('/api/probe/holds').set('X-Client-Id', randomUUID()).expect(204);
  });

  it('rotar X-Client-Id no evade el límite por IP de la consulta del boleto', async () => {
    const server = ctx.app.getHttpServer();
    for (let i = 0; i < RATE_LIMITS.lookup.ip.limit; i += 1) {
      await request(server).post('/api/probe/lookup').set('X-Client-Id', randomUUID()).expect(204);
    }
    await request(server).post('/api/probe/lookup').set('X-Client-Id', randomUUID()).expect(429);
  });

  it('no limita /health', async () => {
    const server = ctx.app.getHttpServer();
    for (let i = 0; i < 5; i += 1) {
      await request(server).get('/health').expect(200);
    }
  });
});
