import { ErrorResponseSchema } from '@kata/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app';

describe('Health y formato de error', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /health responde 200 con la base arriba (fuera del prefijo /api)', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('GET /api/health no existe: health vive fuera de /api', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/health').expect(404);
    expect(response.body).toEqual({
      code: 'ROUTE_NOT_FOUND',
      message: expect.any(String),
      details: null,
    });
  });

  it('una ruta inexistente responde con el formato único { code, message, details }', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/no-existe').expect(404);
    expect(ErrorResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it('un JSON inválido responde 400 BAD_REQUEST con el formato único', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/no-existe')
      .set('Content-Type', 'application/json')
      .send('{"roto": ')
      .expect(400);
    expect(response.body).toMatchObject({ code: 'BAD_REQUEST', details: null });
  });
});
