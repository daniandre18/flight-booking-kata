# Flight Booking Realtime

Prototipo de reservas de vuelos en tiempo real: búsqueda de vuelos, mapa de asientos en vivo,
bloqueo temporal con reloj compartido, confirmación con pago ficticio y tablero de ocupación.
Prueba técnica Full Stack Senior.

> **Estado**: bloque 1 implementado (fases 1–3: monorepo, contratos compartidos y backend base).
> Las historias de usuario llegan en los bloques siguientes. Ver
> [specs/001-realtime-flight-booking/tasks.md](specs/001-realtime-flight-booking/tasks.md).

## Stack

| Paquete                    | Tecnología                                                           |
| -------------------------- | -------------------------------------------------------------------- |
| `shared/` (`@kata/shared`) | TypeScript 6, zod 4: enums, esquemas, errores y eventos              |
| `backend/`                 | NestJS 11, Prisma 7 (adaptador `pg`), PostgreSQL 16, Socket.io, pino |
| `frontend/`                | Angular 22 (standalone, signals), Angular Material, socket.io-client |

Monorepo con pnpm workspaces. Node.js LTS (`.nvmrc`), pnpm 10 (`packageManager`).

## Levantar todo

```bash
docker compose up --build
```

- Web: <http://localhost:8080> · API: <http://localhost:3000/api> · Health: <http://localhost:8080/health>
- La api aplica migraciones y carga los datos de prueba si la base está vacía.

## Desarrollo local

```bash
cp .env.example .env
pnpm install
docker compose up -d db
pnpm --filter backend migrate   # migraciones
pnpm seed                       # datos de prueba (borra y regenera)
pnpm dev                        # api en :3000 y web en :4200 (proxy a la api)
```

## Scripts

| Script           | Qué hace                                                                       |
| ---------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`       | api y web en modo desarrollo                                                   |
| `pnpm build`     | compila los tres paquetes                                                      |
| `pnpm typecheck` | `tsc --noEmit` en los tres paquetes                                            |
| `pnpm lint`      | ESLint (sin `any`)                                                             |
| `pnpm test`      | pruebas de shared, backend (unitarias + e2e contra PostgreSQL real) y frontend |
| `pnpm seed`      | regenera los datos de prueba                                                   |

Las pruebas e2e levantan PostgreSQL 16 con Testcontainers. Para usar una base existente:
`TEST_DATABASE_URL=postgresql://... pnpm --filter backend test:e2e`.

## Variables de entorno

Ver [.env.example](.env.example): `DATABASE_URL`, `DB_POOL_MAX` (pool del adaptador pg, 20),
`ADMIN_KEY`, `HOLD_TTL_SECONDS` (600), `HOLD_SWEEP_INTERVAL_MS` (2000), `PORT`, `LOG_LEVEL`.

## Datos de prueba

- 5 aeropuertos (BOG, MDE, CLO, CTG, BAQ), 20 rutas, 3 vuelos diarios durante 7 días.
- Aviones de 30 filas × 6 asientos (A–F).
- Un vuelo BOG → MDE de mañana con 1 asiento libre (30F) y 45 reservas reales; el seed imprime
  su id y una reserva de ejemplo.
- Tarjeta de prueba que siempre se rechaza: `4000 0000 0000 0002`.

## Tiempos medidos

_Se completa en la validación final (T147)._

## Documentación

- [Arquitectura](docs/architecture.md)
- [Uso de IA](docs/ia.md)
- Especificación, plan y tareas: [specs/001-realtime-flight-booking/](specs/001-realtime-flight-booking/)
