import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ClientIdSchema } from '@kata/shared';
import { firstValueFrom } from 'rxjs';
import { clientIdInterceptor } from './client-id.interceptor';
import { ClientIdService } from './client-id.service';

describe('clientIdInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([clientIdInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('añade X-Client-Id (UUID v4 persistente) a las llamadas a /api', async () => {
    const pending = firstValueFrom(http.get('/api/clients/me/holds'));
    const request = controller.expectOne('/api/clients/me/holds');
    const clientId = request.request.headers.get('X-Client-Id');
    expect(ClientIdSchema.safeParse(clientId).success).toBe(true);
    expect(clientId).toBe(TestBed.inject(ClientIdService).clientId);
    request.flush({});
    await pending;
  });

  it('no añade el header a otros orígenes', async () => {
    const pending = firstValueFrom(http.get('https://example.com/data'));
    const request = controller.expectOne('https://example.com/data');
    expect(request.request.headers.has('X-Client-Id')).toBe(false);
    request.flush({});
    await pending;
  });
});

describe('ClientIdService', () => {
  beforeEach(() => localStorage.clear());

  it('reutiliza el clientId guardado si es válido', () => {
    const saved = '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f708192';
    localStorage.setItem('kata.clientId', saved);
    expect(new ClientIdService().clientId).toBe(saved);
  });

  it('reemplaza un valor guardado que no cumple ClientIdSchema', () => {
    localStorage.setItem('kata.clientId', 'manipulado');
    const service = new ClientIdService();
    expect(service.clientId).not.toBe('manipulado');
    expect(ClientIdSchema.safeParse(service.clientId).success).toBe(true);
    expect(localStorage.getItem('kata.clientId')).toBe(service.clientId);
  });
});
