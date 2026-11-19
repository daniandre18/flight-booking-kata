import { config } from 'dotenv';
import { resolve } from 'node:path';

/** Carga `.env` de backend/ o de la raíz del monorepo; en docker las variables ya vienen dadas. */
export function loadEnvFiles(): void {
  config({
    path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')],
    quiet: true,
  });
}
