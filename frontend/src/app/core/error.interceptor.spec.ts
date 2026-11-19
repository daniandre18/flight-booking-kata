import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ERROR_CODES } from '@kata/shared';
import { firstValueFrom } from 'rxjs';
import { ApiError } from './api-error';
import { ERROR_MESSAGES, messageFor } from './error-messages';
import { errorInterceptor, SILENT_ERRORS } from './error.interceptor';
import { NotificationService } from './notification.service';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let shown: string[];

  beforeEach(() => {
    shown = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        {
          provide: NotificationService,
          useValue: { show: (message: string) => shown.push(message) },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  async function failWith(
    status: number,
    body: object | string,
    context?: HttpContext,
  ): Promise<ApiError> {
    const pending = firstValueFrom(http.post('/api/x', {}, { context }));
    controller.expectOne('/api/x').flush(body, { status, statusText: 'Error' });
    return pending.then(
      () => Promise.reject(new Error('debía fallar')),
      (error: unknown) => error as ApiError,
    );
  }

  it('traduce el code con el mapa único y muestra un toast', async () => {
    const error = await failWith(409, { code: 'SEAT_UNAVAILABLE', message: 'x', details: null });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'SEAT_UNAVAILABLE' });
    expect(error.message).toBe('Este asiento ya no está disponible. Elige otro asiento del mapa.');
    expect(shown).toEqual([error.message]);
  });

  it('429 TOO_MANY_REQUESTS → "Demasiados intentos, espera un momento."', async () => {
    const error = await failWith(429, { code: 'TOO_MANY_REQUESTS', message: 'x', details: null });
    expect(error.message).toBe('Demasiados intentos, espera un momento.');
  });

  it('sin cuerpo con formato único usa un mensaje genérico, sin detalles técnicos', async () => {
    const error = await failWith(500, '<html>stack</html>');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe(ERROR_MESSAGES.INTERNAL_ERROR);
    expect(error.message).not.toContain('stack');
  });

  it('error de red (status 0) → mensaje de conexión', async () => {
    const pending = firstValueFrom(http.get('/api/y'));
    controller.expectOne('/api/y').error(new ProgressEvent('error'), { status: 0 });
    const error = (await pending.catch((reason: unknown) => reason)) as ApiError;
    expect(error.code).toBe('NETWORK_ERROR');
    expect(shown).toEqual([messageFor('NETWORK_ERROR')]);
  });

  it('con SILENT_ERRORS no muestra el toast pero igual traduce', async () => {
    const context = new HttpContext().set(SILENT_ERRORS, true);
    const error = await failWith(
      404,
      { code: 'BOOKING_NOT_FOUND', message: 'x', details: null },
      context,
    );
    expect(error.message).toBe(ERROR_MESSAGES.BOOKING_NOT_FOUND);
    expect(shown).toEqual([]);
  });

  it('hay un mensaje en español para cada ErrorCode del contrato', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(10);
    }
  });
});
