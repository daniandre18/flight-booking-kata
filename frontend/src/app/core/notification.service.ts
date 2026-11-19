import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Toasts (Angular Material). El snack bar anuncia el texto por una región `aria-live`. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  show(message: string): void {
    this.snackBar.open(message, 'Cerrar', { duration: 6_000, politeness: 'assertive' });
  }
}
