import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no carga .env por sí solo: se usa el de backend/ o, si no existe, el de la raíz.
// Los comandos de Prisma se ejecutan desde backend/.
loadEnv({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')], quiet: true });

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` no necesita conexión (build de docker sin DATABASE_URL);
  // migrate y seed fallan con un mensaje claro si falta.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
