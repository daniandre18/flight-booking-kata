import { ErrorResponseSchema } from '@kata/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from '../support/test-app';

describe('Endurecimiento HTTP (principio X)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp({ env: { CORS_ORIGINS: 'http://localhost:4200' } });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('envía las cabeceras de seguridad de helmet', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/health').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('permite CORS solo desde el origen del frontend', async () => {
    const allowed = await request(ctx.app.getHttpServer())
      .options('/api/flights')
      .set('Origin', 'http://localhost:4200')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-Client-Id');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:4200');

    const denied = await request(ctx.app.getHttpServer())
      .options('/api/flights')
      .set('Origin', 'https://sitio-malicioso.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rechaza un body de más de 16 kb con 400 y el formato único', async () => {
    const huge = JSON.stringify({ relleno: 'x'.repeat(32 * 1024) });
    const response = await request(ctx.app.getHttpServer())
      .post('/api/no-existe')
      .set('Content-Type', 'application/json')
      .send(huge)
      .expect(400);
    expect(ErrorResponseSchema.parse(response.body)).toEqual({
      code: 'BAD_REQUEST',
      message: expect.any(String),
      details: null,
    });
  });
});
