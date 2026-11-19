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

## Estrategia de concurrencia

_Se detalla en el bloque 2 (fase 4: bloqueos)._ Principios ya fijados:

- Toda transición de asiento es un `UPDATE` condicional cuyo conteo decide; nunca `SELECT` y
  luego `UPDATE`.
- Orden de locks: vuelo → advisory lock del cliente → asientos.
- Transacciones de Prisma con `maxWait` y `timeout` de 10 s y pool `DB_POOL_MAX=20`
  (en Prisma 7 el pool lo define el adaptador `pg`, no la URL).

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
