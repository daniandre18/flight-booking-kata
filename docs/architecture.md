# Arquitectura

Documento vivo: cada fase lo actualiza con lo que introduce (constitución, principio IX).
Decisiones completas y alternativas en
[research.md](../specs/001-realtime-flight-booking/research.md).

## Visión general

Monolito modular en NestJS con arquitectura hexagonal, frontend Angular y contratos compartidos
en `@kata/shared`. Los comandos van por HTTP y los cambios se difunden por Socket.io solo
después del commit.

```text
frontend (Angular) ──HTTP /api──▶ backend (NestJS) ──▶ PostgreSQL 16
        ▲                              │
        └──── Socket.io /realtime ◀────┘   (eventos tras el commit)
```

## Contratos compartidos (`@kata/shared`)

- Enums de dominio, esquemas zod (DTOs y requests) con sus tipos inferidos, códigos de error con
  su estado HTTP y el catálogo tipado de eventos Socket.io.
- Los esquemas que dependen del tiempo (fecha de búsqueda, vencimiento de tarjeta) son fábricas
  que reciben `now`: el backend les pasa su reloj inyectado.
- Se compila a CommonJS + tipos; backend y frontend importan el mismo paquete.

## Módulos del backend

| Módulo          | Responsabilidad                           | Tablas que escribe                              |
| --------------- | ----------------------------------------- | ----------------------------------------------- |
| `flights`       | vuelos, búsqueda, estado                  | `flights`                                       |
| `seats`         | bloqueos, liberación, expiración          | `seats`                                         |
| `bookings`      | confirmación, idempotencia, boleto        | `bookings`, `booking_seats`, `idempotency_keys` |
| `realtime`      | gateway Socket.io y publicador de eventos | —                                               |
| `admin`         | retraso y cancelación (clave de admin)    | — (orquesta flights y seats)                    |
| `health`        | `GET /health`                             | —                                               |
| `shared-kernel` | puertos y primitivas transversales        | `flight_events`                                 |

Cada módulo tiene `domain/` (reglas puras), `application/` (casos de uso y puertos) e
`infrastructure/` (Prisma, HTTP, gateway). Otros módulos solo importan su API pública
(`index.ts`).

## Shared kernel

| Puerto              | Implementación                       | Para qué                                                                                 |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `Clock`             | `SystemClock` (pruebas: `FakeClock`) | el dominio nunca llama a `new Date()`                                                    |
| `UnitOfWork`        | `PrismaUnitOfWork`                   | transacción compartida por contexto `AsyncLocalStorage`                                  |
| `FlightWriteLock`   | `PrismaFlightWriteLock`              | `UPDATE flights SET seq = seq WHERE … <condición>`: lock + verificación en una sentencia |
| `FlightEventLog`    | `PrismaFlightEventLog`               | avanza `seq` en n y guarda los eventos en `flight_events`                                |
| `FlightStatsReader` | `PrismaFlightStatsReader`            | resumen con vista perezosa en una sola sentencia                                         |
| `EventPublisher`    | `EventEmitterPublisher`              | bus interno; se publica tras el commit                                                   |

## Calidad y seguridad base (fase 3b, constitución 1.1.0)

| Medida                                                                                                                                            | Dónde                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `complexity` ≤ 10, `max-lines-per-function` ≤ 40 (pruebas exentas solo de esta regla), `max-params` ≤ 4, sin `console.log`, sin `$queryRawUnsafe` | `eslint.config.mjs` (probado en `backend/test/unit/tooling/eslint-rules.spec.ts`) |
| Frontend sin `innerHTML` ni `bypassSecurityTrust*`                                                                                                | ESLint + `scripts/check-templates.mjs` (encadenado a `pnpm lint`)                 |
| Cobertura ≥ 80 % de líneas y ramas en `shared/` y en `backend/src/**/{domain,application}`                                                        | `pnpm test:cov`                                                                   |
| `X-Client-Id` UUID v4                                                                                                                             | `ClientIdSchema` (`@kata/shared`) en `@ClientId()` y en el handshake del socket   |
| `holderTag` en logs y eventos; redact de `X-Client-Id`, `X-Admin-Key`, `authorization` y tarjeta                                                  | `holderTagOf`, `logger.module.ts`                                                 |
| helmet, CORS (`CORS_ORIGINS`), body ≤ `BODY_LIMIT` (16 kb)                                                                                        | `app.setup.ts`                                                                    |
| Límites de solicitudes con dos contadores (`ip` y `client`) → `429 TOO_MANY_REQUESTS` + `Retry-After`                                             | `rate-limits.ts`, `ApiExceptionFilter`                                            |
| Clave de admin en tiempo constante                                                                                                                | `AdminKeyGuard` (`timingSafeEqual` sobre SHA-256)                                 |
| Marca y últimos 4 de la tarjeta, nunca el número                                                                                                  | `detectCardBrand`, columna `bookings.card_brand` (migración `0002`)               |

**SOLID en la base**: `FlightStatusPort` (antes `FlightRepository`) separado de las consultas;
`FlightWriteContext` agrupa `UnitOfWork`, `FlightWriteLock`, `FlightEventLog`,
`FlightStatsReader`, `EventPublisher` y `Clock` en un único parámetro; dobles en memoria en
`backend/test/doubles/` y pruebas de contrato de `Clock` y `EventPublisher` en
`backend/test/contracts/`.

## Estrategia de concurrencia (fase 4)

Un bloqueo es una transacción con orden de locks fijo **vuelo → cliente → asiento**:

```text
HoldSeatUseCase (UnitOfWork, READ COMMITTED)
 1. FlightWriteLock.acquire(bookable)   UPDATE flights SET seq = seq WHERE id=… AND status IN (…) AND departure_at > now
 2. SeatHoldsPort.lockClientHolds       pg_advisory_xact_lock(hashtext(clientId), hashtext(flightId)) + conteo
 3. hold-policy (dominio)               límite de 4 y vencimiento compartido
 4. SeatHoldsPort.holdIfAvailable       UPDATE seats … WHERE (AVAILABLE OR HELD vencido)  → count 1 gana, 0 = 409
 5. recordFlightChange                  seq + n en flights, fila en flight_events, resumen del vuelo
 commit → EventPublisher (SeatHeld, FlightStatsChanged)
```

- **Atomicidad**: la propiedad del asiento la decide el `UPDATE` condicional (paso 4); nunca
  `SELECT` y luego `UPDATE`. La lectura del paso 2 solo resume los bloqueos del propio cliente y
  está serializada por el advisory lock (excepción justificada en el plan).
- **Sin interbloqueos ni carreras con la cancelación**: todas las escrituras toman primero la
  fila del vuelo, así que se serializan por vuelo y `seq` sigue el orden de commit.
- **Vista perezosa**: un `HELD` vencido cuenta como disponible en el `UPDATE`, en el snapshot y
  en las estadísticas; el barrido de la fase 6 solo notifica.
- **Snapshot coherente**: `GetSeatMapUseCase` lee vuelo (`seq`) y asientos en una transacción
  `REPEATABLE READ` de solo lectura.
- **Prueba**: 100 `POST …/hold` simultáneos con clientes distintos → exactamente 1 `201`, 99
  `409 SEAT_UNAVAILABLE` y ningún `500` (`hold-concurrency.e2e-spec.ts`, PostgreSQL real).
- Pool del adaptador `pg` de 20 conexiones y transacciones con `maxWait`/`timeout` de 10 s.

## Persistencia

- Prisma 7 con el generador `prisma-client` (CommonJS) y el adaptador `@prisma/adapter-pg`.
- Migración inicial: esquema de Prisma + restricciones que Prisma no expresa (CHECK de rutas,
  horarios, filas y letras, coherencia HELD ⇔ dueño y vencimiento; índices parciales).
- Usar `prisma migrate deploy`; si se generan migraciones nuevas, revisar que no eliminen esos
  objetos.

## Errores

Filtro global con formato único `{ code, message, details }`. El estado HTTP sale del mapa de
`@kata/shared` (409 solo para conflictos de asiento; reglas de negocio en 422).

## Eventos y resincronización

_Se detalla en el bloque 3 (fase 6)._

## Despliegue local

`docker compose up` levanta `db` (PostgreSQL 16), `api` (migraciones → seed si está vacía →
servidor) y `web` (nginx con la SPA y proxy de `/api`, `/health` y `/socket.io`).

## Puertas de calidad

`pnpm typecheck`, `pnpm lint` y `pnpm test`. Resultado por bloque en el resumen de cada entrega.
