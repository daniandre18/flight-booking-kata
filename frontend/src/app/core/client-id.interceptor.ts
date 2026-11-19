import { type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ClientIdService } from './client-id.service';

/** Añade `X-Client-Id` a las llamadas a la api propia (nunca a otros orígenes). */
export const clientIdInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) {
    return next(request);
  }
  const { clientId } = inject(ClientIdService);
  return next(request.clone({ setHeaders: { 'X-Client-Id': clientId } }));
};
