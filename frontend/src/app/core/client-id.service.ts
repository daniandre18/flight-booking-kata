import { Injectable } from '@angular/core';
import { ClientIdSchema } from '@kata/shared';
import { uuidV4 } from './uuid';

const STORAGE_KEY = 'kata.clientId';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(clientId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, clientId);
  } catch {
    // Almacenamiento bloqueado (modo privado estricto): el id vive solo en memoria.
  }
}

/**
 * Identidad anónima del navegador (principio VII): UUID v4 persistente en `localStorage`. Si el
 * valor guardado no cumple `ClientIdSchema` (manipulado o de otra versión), se genera uno nuevo.
 */
@Injectable({ providedIn: 'root' })
export class ClientIdService {
  readonly clientId: string;

  constructor() {
    const stored = readStored();
    const parsed = ClientIdSchema.safeParse(stored);
    if (parsed.success) {
      this.clientId = parsed.data;
      return;
    }
    this.clientId = uuidV4();
    store(this.clientId);
  }
}
