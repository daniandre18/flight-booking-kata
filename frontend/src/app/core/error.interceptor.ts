import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from './api-error';
import { NotificationService } from './notification.service';

/** Para pantallas que muestran el error junto al formulario en lugar de un toast. */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);

/**
 * Traduce cada error con el mapa único (`error-messages.ts`) y lo muestra en un toast. Re-lanza un
 * `ApiError` para que el store revierta la UI optimista al último estado confirmado (principio VI).
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const notifications = inject(NotificationService);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }
      const apiError = ApiError.from(error);
      if (!request.context.get(SILENT_ERRORS)) {
        notifications.show(apiError.message);
      }
      return throwError(() => apiError);
    }),
  );
};
