---

description: "Lista de tareas de implementación: Reservas de vuelos en tiempo real"
---

# Tareas: Reservas de vuelos en tiempo real

**Entrada**: documentos de diseño en `/specs/001-realtime-flight-booking/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: incluidas. La constitución (principio V) exige escribir antes de la implementación
las pruebas de concurrencia, expiración, confirmación con bloqueo vencido, idempotencia y
cancelación con bloqueos activos. Cada prueba marcada "escribir primero" debe fallar antes de
implementar.

**Organización**: 10 fases en el orden pedido. Las fases de historia llevan la etiqueta de la
historia de [spec.md](./spec.md): **US1** búsqueda (HU1), **US2** bloqueos (HU2), **US3**
reservas (HU3), **US4** tablero y admin (HU4).

## Formato: `[ID] [P?] [Historia] Descripción con ruta`

- **[P]**: puede ir en paralelo (archivos distintos, sin dependencias pendientes).
- **[USn]**: historia a la que pertenece la tarea (solo en las fases de historia).
- Las rutas son relativas a la raíz del repositorio (`flight-booking-kata/`).

---

## Fase 1: Setup del monorepo y docker compose

**Propósito**: monorepo pnpm con los tres paquetes, calidad de código y contenedores.

- [X] T001 Crear `package.json` raíz con `packageManager` (pnpm), `engines.node` y scripts `dev`, `test`, `lint`, `typecheck` (`tsc --noEmit` en los tres paquetes), `build`, `seed` que delegan en los paquetes con `pnpm -r` / `--filter` en package.json
- [X] T002 Crear `pnpm-workspace.yaml` con los paquetes `backend`, `frontend` y `shared` en pnpm-workspace.yaml
- [X] T003 [P] Crear `tsconfig.base.json` con `strict: true`, `noImplicitAny`, `noUncheckedIndexedAccess` y paths a `@kata/shared` en tsconfig.base.json
- [X] T004 [P] Configurar ESLint flat config compartido con `@typescript-eslint/no-explicit-any` como error para los tres paquetes en eslint.config.mjs
- [X] T005 [P] Configurar Prettier y sus exclusiones en .prettierrc y .prettierignore
- [X] T006 [P] Fijar la versión LTS de Node y las exclusiones de git en .nvmrc y .gitignore
- [X] T007 [P] Crear la plantilla de variables (`DATABASE_URL`, `ADMIN_KEY`, `HOLD_TTL_SECONDS=600`, `HOLD_SWEEP_INTERVAL_MS=2000`, `PORT`, `LOG_LEVEL`) en .env.example
- [X] T008 [P] Crear el paquete `@kata/shared` (build a ESM + tipos, Jest) en shared/package.json, shared/tsconfig.json, shared/jest.config.ts y shared/src/index.ts
- [X] T009 [P] Crear el proyecto NestJS con dependencias (Prisma, nestjs-zod, @nestjs/schedule, @nestjs/event-emitter, @nestjs/websockets, socket.io, nestjs-pino) en backend/package.json, backend/tsconfig.json, backend/nest-cli.json y backend/src/main.ts
- [X] T010 [P] Crear el proyecto Angular standalone (signals, Angular Material, socket.io-client) con proxy de desarrollo (:4200 → :3000 para `/api` y `/health`, y `/socket.io` con `ws: true`, por donde viaja el namespace `/realtime`) referenciado desde `angular.json`, en frontend/package.json, frontend/proxy.conf.json, frontend/angular.json, frontend/tsconfig.json, frontend/src/main.ts y frontend/src/app/app.config.ts
- [X] T011 [P] Configurar Jest del backend para pruebas unitarias y e2e en backend/jest.config.ts y backend/test/jest-e2e.config.ts
- [X] T012 [P] Crear la imagen multi-etapa de la api y su entrypoint (`prisma migrate deploy`, seed si la base está vacía, arranque) en backend/Dockerfile y backend/docker/entrypoint.sh
- [X] T013 [P] Crear la imagen de la web (build de Angular + nginx) con proxy a `/api`, `/health` y `/socket.io` con soporte de upgrade en frontend/Dockerfile y frontend/nginx.conf
- [X] T014 Crear `docker-compose.yml` con `postgres:16` (healthcheck), `api` (depende de postgres sano) y `web` (puerto 8080), con variables de .env.example, en docker-compose.yml (depende de T012, T013)
- [X] T015 [P] Crear los esqueletos de la documentación entregable (encabezados y secciones a completar: README con ejecución y pruebas; architecture con módulos, concurrencia y eventos; ia con el registro de uso de IA desde la constitución) para actualizarlos fase a fase según el principio IX, en README.md, docs/architecture.md y docs/ia.md

**Checkpoint**: `pnpm install`, `pnpm lint` y `docker compose config` funcionan. Documentación actualizada (principio IX).

---

## Fase 2: Shared (tipos, zod y eventos)

**Propósito**: único origen de contratos (principio III). Bloquea backend y frontend.

- [X] T016 [P] Crear los enums `SeatStatus`, `FlightStatus`, `SeatType`, `ReleaseReason` y `FlightEventType` según data-model.md § Enums en shared/src/enums/index.ts
- [X] T017 [P] Crear `ErrorCode`, el mapa código → HTTP de research.md §17 y el esquema `ErrorResponse` `{ code, message, details }` en shared/src/errors/index.ts
- [X] T018 [P] Crear las utilidades de asiento (patrón y parseo de `SeatCode`, derivación del tipo desde la letra) para data-model.md `seats.row` y `seats.letter` en shared/src/domain/seat-code.ts
- [X] T019 [P] Crear los esquemas zod `SearchFlightsQuery` (fecha ≥ hoy en Bogotá, origen ≠ destino), `FlightDto`, `FlightStatsDto`, `ActivityEntryDto` y `UpdateFlightStatusRequest` según data-model.md § Validaciones de entrada y contracts/openapi.yaml en shared/src/schemas/flight.schema.ts
- [X] T020 [P] Crear los esquemas zod `SeatDto`, `SeatMapSnapshot`, `HoldSeatResponse` y `MyHoldsResponse` según contracts/openapi.yaml en shared/src/schemas/seat.schema.ts
- [X] T021 [P] Crear los esquemas zod `CreateBookingRequest` (1–4 pasajeros sin asientos repetidos, tarjeta de 16 dígitos, `MM/YY` futuro, CVV de 3 dígitos), `BookingLookupRequest` (normaliza código a mayúsculas y correo a minúsculas) y `BookingDto` según data-model.md § Validaciones de entrada en shared/src/schemas/booking.schema.ts
- [X] T022 [P] Crear el catálogo tipado de eventos: constantes `RealtimeEvents`, esquemas de payload con `BaseEvent` (`flightId`, `seq`, `occurredAt`), `ServerToClientEvents` y `ClientToServerEvents` (con acks) según contracts/realtime-events.md en shared/src/realtime/events.ts
- [X] T023 Exportar enums, errores, utilidades, esquemas, tipos inferidos y eventos en shared/src/index.ts (depende de T016–T022)
- [X] T024 [P] Probar los esquemas: origen = destino, fecha pasada en Bogotá, vencimiento de tarjeta, patrón de asiento, pasajeros repetidos y normalización del lookup en shared/test/schemas.spec.ts

**Checkpoint**: `pnpm --filter @kata/shared build test` pasa y backend y frontend pueden importar `@kata/shared`. Documentación actualizada (principio IX).

---

## Fase 3: Backend base (Prisma, migraciones, seeds, errores, health)

**Propósito**: infraestructura común que bloquea todas las historias.

**⚠️ CRÍTICO**: ninguna historia empieza antes de terminar esta fase.

- [X] T025 Definir el esquema Prisma con las tablas y columnas de data-model.md: `airports.code`, `airports.city`; `flights.id`, `flights.flight_number`, `flights.origin`, `flights.destination`, `flights.scheduled_departure_at`, `flights.departure_at`, `flights.arrival_at`, `flights.fare`, `flights.status`, `flights.capacity`, `flights.seq`, `flights.created_at`, `flights.updated_at`; `seats.id`, `seats.flight_id`, `seats.row`, `seats.letter`, `seats.status`, `seats.held_by`, `seats.hold_expires_at`, `seats.version`; `bookings.id`, `bookings.code`, `bookings.flight_id`, `bookings.client_id`, `bookings.buyer_name`, `bookings.buyer_email`, `bookings.total`, `bookings.card_last4`, `bookings.created_at`; `booking_seats.booking_id`, `booking_seats.seat_id`, `booking_seats.passenger_name`; `idempotency_keys.client_id`, `idempotency_keys.key`, `idempotency_keys.request_hash`, `idempotency_keys.booking_id`, `idempotency_keys.created_at`; `flight_events.flight_id`, `flight_events.seq`, `flight_events.type`, `flight_events.seat_code`, `flight_events.payload`, `flight_events.occurred_at`, en backend/prisma/schema.prisma
- [X] T026 Generar la migración inicial y añadirle en SQL lo que Prisma no expresa: CHECK de `flights.origin` ≠ `flights.destination`, `flights.departure_at` ≥ `flights.scheduled_departure_at`, `flights.arrival_at` > `flights.departure_at`, rangos de `seats.row` y `seats.letter`, coherencia HELD ⇔ `seats.held_by` y `seats.hold_expires_at` no nulos, `UNIQUE(booking_seats.seat_id)`, `UNIQUE(bookings.code)`, e índices parciales `(flight_id, held_by) WHERE status = 'HELD'` y `(hold_expires_at) WHERE status = 'HELD'` (data-model.md § seats), en backend/prisma/migrations/0001_init/migration.sql
- [X] T027 [P] Crear `PrismaService` con conexión, cierre ordenado y opciones de transacción interactiva `maxWait = 10000` y `timeout = 10000` ms (research.md §4) en backend/src/shared-kernel/infrastructure/persistence/prisma.service.ts
- [X] T028 Crear el puerto `UnitOfWork` (`run(fn)`) y `PrismaUnitOfWork`, que abre una transacción interactiva y la comparte con los repositorios mediante `AsyncLocalStorage` (helper `currentTx()`), según research.md §3, en backend/src/shared-kernel/application/unit-of-work.ts y backend/src/shared-kernel/infrastructure/persistence/prisma-unit-of-work.ts
- [X] T029 [P] Crear el puerto `Clock` y `SystemClock` en backend/src/shared-kernel/domain/clock.ts y backend/src/shared-kernel/infrastructure/system-clock.ts
- [X] T030 [P] Crear `FakeClock` controlable (`set`, `advance`) para pruebas unitarias y e2e en backend/test/support/fake-clock.ts
- [X] T031 [P] Crear la jerarquía `DomainError` con `ErrorCode` de `@kata/shared` y `details` opcional en backend/src/shared-kernel/domain/domain-error.ts
- [X] T032 [P] Crear el puerto `EventPublisher` y los tipos de eventos de dominio (`SeatHeld`, `SeatReleased`, `SeatBooked`, `FlightUpdated`, `FlightStatsChanged`) en backend/src/shared-kernel/application/event-publisher.ts
- [X] T033 [P] Implementar `EventEmitterPublisher` (EventEmitter2) que publica después del commit en backend/src/realtime/infrastructure/event-emitter.publisher.ts
- [X] T034 Crear el filtro global de errores: `DomainError` → HTTP según research.md §17; zod → `422 VALIDATION_ERROR` con `details` por campo; JSON inválido → `400 BAD_REQUEST`; violación de unicidad de Prisma → código de dominio; P2028 (timeout de transacción, con log de advertencia) y resto → `500 INTERNAL_ERROR` sin filtrar internos, en backend/src/shared-kernel/infrastructure/http/error.filter.ts
- [X] T035 [P] Configurar la validación con nestjs-zod sobre los esquemas de `@kata/shared` en backend/src/shared-kernel/infrastructure/http/zod-validation.ts
- [X] T036 [P] Crear el decorador `@ClientId()` que exige `X-Client-Id` UUID (`400 CLIENT_ID_REQUIRED`) en backend/src/shared-kernel/infrastructure/http/client-id.decorator.ts
- [X] T037 [P] Configurar logs JSON con nestjs-pino (contexto `flightId`, `seatId`, `clientId`; redacción de `card.number` y `card.cvv`) en backend/src/shared-kernel/infrastructure/logger.module.ts
- [X] T038 [P] Validar las variables de entorno con zod (`DATABASE_URL`, `DB_POOL_MAX` por defecto 20 —pool del adaptador pg de Prisma 7—, `HOLD_TTL_SECONDS` por defecto 600, `HOLD_SWEEP_INTERVAL_MS` por defecto 2000, `ADMIN_KEY` obligatoria) en backend/src/shared-kernel/infrastructure/config.ts
- [X] T039 Crear el puerto `FlightWriteLock` (`acquire(flightId, condición)` → `seq` actual) e implementarlo según research.md §6: bloquea la fila con `UPDATE flights SET seq = seq WHERE id = :id AND <condición> RETURNING seq` (data-model.md `flights.seq`, `flights.status`, `flights.departure_at`), con condiciones `bookable`, `notCancelled` y `any`; sin fila → error de dominio, en backend/src/shared-kernel/application/flight-write-lock.port.ts y backend/src/shared-kernel/infrastructure/persistence/flight-write-lock.ts
- [X] T040 [P] Crear el puerto `FlightEventLog` (`append(flightId, events)` → eventos numerados) e implementarlo: avanza data-model.md `flights.seq` en n sobre la fila ya bloqueada e inserta en `flight_events` con `seq` consecutivas y payload sin `clientId` (data-model.md `flight_events.seq`, `flight_events.type`, `flight_events.seat_code`, `flight_events.payload`, `flight_events.occurred_at`), en backend/src/shared-kernel/application/flight-event-log.port.ts y backend/src/shared-kernel/infrastructure/persistence/flight-events.writer.ts
- [X] T041 [P] Crear el puerto `FlightStatsReader` e implementar la consulta de estadísticas y del resumen del vuelo para `flight:stats` con vista perezosa (HELD vencido cuenta como disponible; `available + held + booked` = data-model.md `flights.capacity`; fuera de una transacción activa, `seq` y conteos se leen en `REPEATABLE READ` de solo lectura, research.md §13) en backend/src/shared-kernel/application/flight-stats-reader.port.ts y backend/src/shared-kernel/infrastructure/persistence/flight-stats.query.ts
- [X] T042 [P] Definir el puerto `FlightRepository` con `markSoldOutIfFull` (se amplía en las fases 7 y 9) en backend/src/flights/application/ports/flight.repository.ts
- [X] T043 Implementar `PrismaFlightRepository.markSoldOutIfFull` con la sentencia condicional de research.md §14 sobre data-model.md `flights.status` (solo escribe la tabla `flights`) en backend/src/flights/infrastructure/prisma-flight.repository.ts
- [X] T044 Crear `FlightsModule`, que exporta `FlightRepository`, y la API pública del módulo (puertos y reglas de dominio que otros módulos pueden usar) en backend/src/flights/flights.module.ts y backend/src/flights/index.ts
- [X] T045 Crear el controlador de health (`GET /health`, fuera del prefijo `/api`, con `SELECT 1`; 503 si la base no responde) y su módulo en backend/src/health/infrastructure/health.controller.ts y backend/src/health/health.module.ts
- [X] T046 Cablear la aplicación: prefijo `/api` excluyendo `health`, `UnitOfWork`, `FlightsModule`, filtro global, pino, config, EventEmitter, Schedule y shutdown hooks en backend/src/app.module.ts y backend/src/main.ts
- [X] T047 Crear el seed determinista según research.md §22 (PRNG con semilla fija, 5 aeropuertos `airports.code`, 20 rutas, 3 vuelos diarios × 7 días desde hoy en Bogotá, 180 asientos por vuelo según `flights.capacity`, UUID v5, un vuelo con 1 asiento libre cuyos 179 asientos BOOKED pertenecen a reservas reales agrupadas de a 4 con data-model.md `bookings.code`, `booking_seats.seat_id` y `booking_seats.passenger_name` deterministas) en backend/prisma/seed.ts
- [X] T048 [P] Crear el arnés e2e (Testcontainers con PostgreSQL 16 o `TEST_DATABASE_URL`, pool de 20 conexiones, dependencias de desarrollo `@testcontainers/postgresql`, `supertest` y `socket.io-client` en backend/package.json, migraciones, override de `Clock` por `FakeClock`, `ADMIN_KEY` de prueba, fábricas de vuelos y asientos) en backend/test/e2e/support/test-app.ts
- [X] T049 Probar `GET /health` (fuera de `/api`) y el formato de error único (`{ code, message, details }`, JSON inválido → 400) en backend/test/e2e/health.e2e-spec.ts

**Checkpoint**: `docker compose up` deja la api sana con datos de prueba y el arnés e2e arranca. Documentación actualizada (principio IX).

---

## Fase 4: HU2 Bloqueos de asientos (Prioridad: P1) 🎯 MVP

**Objetivo**: bloquear y liberar asientos sin doble bloqueo, con límite de 4 y reloj compartido.

**Prueba independiente**: las pruebas e2e de esta fase pasan contra PostgreSQL real; con curl
se bloquea, se recupera y se libera un asiento (quickstart.md § Prueba rápida por la API).

### Pruebas de HU2 (escribir primero, deben fallar) ⚠️

- [ ] T050 [P] [US2] Escribir la prueba de concurrencia: 100 `POST /api/flights/:id/seats/12C/hold` en paralelo con `clientId` distintos → exactamente 1 respuesta 201, 99 respuestas `409 SEAT_UNAVAILABLE` y ningún 500; en la base hay un solo asiento HELD con el `held_by` del ganador, en backend/test/e2e/seats/hold-concurrency.e2e-spec.ts
- [ ] T051 [P] [US2] Escribir las pruebas de reglas de bloqueo: reloj compartido (con `FakeClock` avanzado, el segundo asiento recibe el mismo `holdExpiresAt`); quinto bloqueo → `422 HOLD_LIMIT_REACHED`; liberar el propio → 204 y ajeno → `409 SEAT_NOT_HELD`; vuelo cancelado, agotado o ya salido → `422 FLIGHT_NOT_BOOKABLE`; toma de un bloqueo vencido por otro cliente → 201; sin `X-Client-Id` → 400; `GET /api/clients/me/holds` devuelve asientos, vencimiento y `holderTag`; el snapshot de `GET /api/flights/:id/seats` trae una `seq` coherente con los asientos, en backend/test/e2e/seats/hold-rules.e2e-spec.ts
- [ ] T052 [P] [US2] Escribir las pruebas unitarias de la política de bloqueo (límite, cálculo del vencimiento compartido, vencido según `Clock`) en backend/test/unit/seats/hold-policy.spec.ts

### Implementación de HU2

- [ ] T053 [P] [US2] Implementar la política de bloqueo pura: `MAX_HOLDS_PER_FLIGHT = 4`, `computeExpiry(existing, now, ttl)` y `isExpired` para data-model.md `seats.hold_expires_at`, en backend/src/seats/domain/hold-policy.ts
- [ ] T054 [P] [US2] Implementar `holderTag` (primeros 16 hex de SHA-256 del `clientId`, research.md §15) en backend/src/seats/application/holder-tag.ts
- [ ] T055 [P] [US2] Definir el puerto `SeatHoldRepository` (`tryHold`, `release`, `getSeatMap`, `getClientHolds`, y los que implementan fases posteriores: `markBooked`, `findFlightsWithExpiredHolds`, `releaseExpired`, `releaseAllHeld`) en backend/src/seats/application/ports/seat-hold.repository.ts
- [ ] T056 [US2] Implementar `PrismaSeatHoldRepository.tryHold` dentro de la transacción activa de `UnitOfWork` (research.md §6–§7): `pg_advisory_xact_lock(clientId, flightId)` → conteo y vencimiento común de los bloqueos vigentes del cliente → `seat.updateMany` condicional sobre data-model.md `seats.status`, `seats.held_by`, `seats.hold_expires_at` y `seats.version` (count 0 → `SEAT_UNAVAILABLE`); solo escribe la tabla `seats`, en backend/src/seats/infrastructure/prisma-seat-hold.repository.ts
- [ ] T057 [US2] Implementar `release` (UPDATE condicional `HELD → AVAILABLE` del dueño vigente; count 0 → `SEAT_NOT_HELD`), `getSeatMap` (snapshot con vista perezosa, `holderTag`, `seq` y `serverNow`, leídos en una transacción `REPEATABLE READ` de solo lectura según research.md §13) y `getClientHolds` en backend/src/seats/infrastructure/prisma-seat-hold.repository.ts
- [ ] T058 [P] [US2] Implementar el caso de uso `HoldSeat` orquestando en `UnitOfWork` `FlightWriteLock` (`bookable`; si no, `422 FLIGHT_NOT_BOOKABLE`) → `SeatHoldRepository.tryHold` → `FlightEventLog.append` → `FlightStatsReader`; tras el commit publica `SeatHeld` y `FlightStatsChanged`, con logs de contexto, en backend/src/seats/application/hold-seat.use-case.ts
- [ ] T059 [P] [US2] Implementar el caso de uso `ReleaseSeat` (en `UnitOfWork`: `FlightWriteLock` (`any`) → `SeatHoldRepository.release` → `FlightEventLog.append`; tras el commit publica `SeatReleased` con `MANUAL` y `FlightStatsChanged`) en backend/src/seats/application/release-seat.use-case.ts
- [ ] T060 [P] [US2] Implementar los casos de uso `GetSeatMap` y `GetMyHolds` en backend/src/seats/application/get-seat-map.use-case.ts y backend/src/seats/application/get-my-holds.use-case.ts
- [ ] T061 [US2] Implementar `SeatsController`: `POST` y `DELETE /api/flights/:id/seats/:seatId/hold`, `GET /api/flights/:id/seats` y `GET /api/clients/me/holds` según contracts/openapi.yaml, en backend/src/seats/infrastructure/seats.controller.ts
- [ ] T062 [US2] Crear `SeatsModule` (puertos → adaptadores), su API pública (puerto `SeatHoldRepository`) y registrarlo en backend/src/seats/seats.module.ts, backend/src/seats/index.ts y backend/src/app.module.ts

**Checkpoint**: T050–T052 pasan; 0 dobles bloqueos con 100 solicitudes simultáneas (CE-001). Documentación actualizada (principio IX).

---

## Fase 5: HU3 Reservas con idempotencia y pago ficticio (Prioridad: P1)

**Objetivo**: confirmar todo o nada los bloqueos vigentes del cliente, con código único, pago
ficticio, idempotencia y consulta del boleto con código y correo.

**Prueba independiente**: las pruebas e2e de esta fase pasan; con curl se bloquea, se confirma
y se consulta el boleto.

### Pruebas de HU3 (escribir primero, deben fallar) ⚠️

- [ ] T063 [P] [US3] Escribir las pruebas de confirmación: éxito → 201, asientos BOOKED, código `^[A-Z0-9]{6}$` y total = tarifa × asientos; bloqueo vencido (`FakeClock`) → `410 HOLD_EXPIRED` sin reserva; tarjeta `4000000000000002` → `402 PAYMENT_DECLINED` con los bloqueos intactos; pasajeros que no cubren todos los bloqueos → `422 PASSENGERS_MISMATCH`; vuelo cancelado → `422 FLIGHT_NOT_BOOKABLE`; reservar el último asiento → vuelo `SOLD_OUT`, en backend/test/e2e/bookings/create-booking.e2e-spec.ts
- [ ] T064 [P] [US3] Escribir las pruebas de idempotencia: misma `Idempotency-Key` dos veces → 201 y luego 200 con `Idempotent-Replayed: true` y el mismo código; dos envíos concurrentes con la misma clave → una sola reserva; misma clave con otro cuerpo → `422 IDEMPOTENCY_KEY_REUSED`; sin clave → `400 IDEMPOTENCY_KEY_REQUIRED`, en backend/test/e2e/bookings/idempotency.e2e-spec.ts
- [ ] T065 [P] [US3] Escribir las pruebas de consulta: código y correo correctos → 200 (correo sin distinguir mayúsculas); correo incorrecto → 404 `BOOKING_NOT_FOUND`; código inexistente → 404 con el mismo mensaje, en backend/test/e2e/bookings/lookup.e2e-spec.ts
- [ ] T066 [P] [US3] Escribir las pruebas unitarias del generador de código y de `FakePaymentGateway` en backend/test/unit/bookings/booking-code.spec.ts y backend/test/unit/bookings/fake-payment.gateway.spec.ts

### Implementación de HU3

- [ ] T067 [P] [US3] Implementar el generador de código de reserva aleatorio para data-model.md `bookings.code` en backend/src/bookings/domain/booking-code.ts
- [ ] T068 [P] [US3] Definir el puerto `PaymentGateway` (`charge` → aprobado o rechazado; solo recibe los últimos 4 dígitos para data-model.md `bookings.card_last4`) en backend/src/bookings/domain/payment-gateway.port.ts
- [ ] T069 [P] [US3] Implementar `FakePaymentGateway` (rechaza `4000000000000002`, aprueba el resto) en backend/src/bookings/infrastructure/fake-payment.gateway.ts
- [ ] T070 [P] [US3] Definir los puertos `BookingRepository` (`save`, `findByCodeAndEmail`) e `IdempotencyStore` (`reserve`, `attach`) en backend/src/bookings/application/ports/booking.repository.ts y backend/src/bookings/application/ports/idempotency.store.ts
- [ ] T071 [US3] Implementar `PrismaSeatHoldRepository.markBooked` (UPDATE condicional `HELD → BOOKED` sobre data-model.md `seats.status`, con `seats.held_by` y `seats.hold_expires_at` vigentes y `(row, letter) IN (...)`, `RETURNING id`; informa además si quedan otros bloqueos vigentes del cliente en el vuelo) en backend/src/seats/infrastructure/prisma-seat-hold.repository.ts
- [ ] T072 [P] [US3] Implementar `PrismaIdempotencyStore`: `reserve` inserta data-model.md `idempotency_keys.client_id`, `idempotency_keys.key` e `idempotency_keys.request_hash` (ante conflicto de unicidad devuelve el `idempotency_keys.booking_id` y el hash guardados) y `attach` completa `idempotency_keys.booking_id`, en backend/src/bookings/infrastructure/prisma-idempotency.store.ts
- [ ] T073 [US3] Implementar `PrismaBookingRepository.save`, que solo escribe tablas del módulo: data-model.md `bookings.code` (reintento si colisiona), `bookings.buyer_name`, `bookings.buyer_email` en minúsculas, `bookings.total`, `bookings.card_last4`, `booking_seats.seat_id` y `booking_seats.passenger_name`, en backend/src/bookings/infrastructure/prisma-booking.repository.ts
- [ ] T074 [US3] Implementar `findByCodeAndEmail` (normalizado; ausencia indistinguible) en backend/src/bookings/infrastructure/prisma-booking.repository.ts
- [ ] T075 [US3] Implementar el caso de uso `CreateBooking` orquestando en `UnitOfWork` los pasos de research.md §9 sobre `IdempotencyStore`, `FlightWriteLock` (`bookable`), `SeatHoldRepository.markBooked`, `PaymentGateway`, `BookingRepository`, `IdempotencyStore.attach`, `FlightRepository.markSoldOutIfFull` y `FlightEventLog.append` (hash de la solicitud normalizada; repetición → `replayed`; tras el commit publica `SeatBooked` por asiento, `FlightUpdated` si quedó `SOLD_OUT` y `FlightStatsChanged`), en backend/src/bookings/application/create-booking.use-case.ts
- [ ] T076 [P] [US3] Implementar el caso de uso `LookupBooking` (misma respuesta 404 en ambos casos) en backend/src/bookings/application/lookup-booking.use-case.ts
- [ ] T077 [US3] Implementar `BookingsController`: `POST /api/bookings` (`Idempotency-Key` obligatorio, 201 o 200 con `Idempotent-Replayed`) y `POST /api/bookings/lookup` según contracts/openapi.yaml, en backend/src/bookings/infrastructure/bookings.controller.ts
- [ ] T078 [US3] Crear `BookingsModule` y registrarlo en backend/src/bookings/bookings.module.ts y backend/src/app.module.ts

**Checkpoint**: T063–T066 pasan; 100 % de las confirmaciones repetidas producen una sola reserva (CE-007). Documentación actualizada (principio IX).

---

## Fase 6: Expiración de bloqueos y RealtimeGateway (US2)

**Objetivo**: liberar y notificar los bloqueos vencidos en ~2 s y difundir por Socket.io cada
cambio tras el commit.

**Prueba independiente**: con un cliente Socket.io de prueba unido al room del vuelo se reciben
`seat:held`, `seat:released` (`EXPIRED`) y `flight:stats` con `seq` consecutivas.

### Pruebas (escribir primero, deben fallar) ⚠️

- [ ] T079 [P] [US2] Escribir las pruebas de expiración: con `FakeClock` avanzado más allá del vencimiento, una pasada del barrido libera los asientos, emite `seat:released` con `EXPIRED` y `seq` consecutivas y actualiza las estadísticas; al arrancar la app, el barrido corre una vez y libera los vencidos (reinicio con bloqueos); con reloj real, `HOLD_TTL_SECONDS` corto y barrido de 2000 ms, el evento `EXPIRED` llega a un socket suscrito en ≤ 3 s tras el vencimiento, en backend/test/e2e/seats/hold-expiration.e2e-spec.ts
- [ ] T080 [P] [US2] Escribir las pruebas del gateway: `flight:join` responde con ack y `seq`; tras un bloqueo, el room recibe `seat:held` con `flightId`, `seatId`, `status`, `seq`, `occurredAt`, `holdExpiresAt` y `holderTag`, nunca el `clientId`; el room `search` recibe `flight:stats` con el resumen y el room del vuelo no lo recibe; ningún evento llega antes del commit; un segundo socket unido al room recibe `seat:held` en < 1 s desde la respuesta 201, en backend/test/e2e/realtime/gateway.e2e-spec.ts

### Implementación

- [ ] T081 [US2] Implementar `findFlightsWithExpiredHolds(now)` y `releaseExpired(flightId, now)` (`UPDATE seats ... WHERE flight_id = :f AND status = 'HELD' AND hold_expires_at <= :now RETURNING`) en backend/src/seats/infrastructure/prisma-seat-hold.repository.ts
- [ ] T082 [US2] Implementar el caso de uso `ReleaseExpiredHolds`: por cada vuelo con vencidos, en `UnitOfWork`, `FlightWriteLock` (`any`) → `releaseExpired` → `FlightEventLog.append`; tras el commit publica `SeatReleased` con `EXPIRED` y `FlightStatsChanged`, en backend/src/seats/application/release-expired-holds.use-case.ts
- [ ] T083 [US2] Implementar `HoldSweeperJob` con un intervalo de `HOLD_SWEEP_INTERVAL_MS` (por defecto 2000, vía `SchedulerRegistry`), sin solapar pasadas, y una ejecución en `onApplicationBootstrap` antes de aceptar tráfico, en backend/src/seats/infrastructure/hold-sweeper.job.ts
- [ ] T084 [P] [US2] Implementar el mapeo de eventos de dominio a payloads de `@kata/shared` (validados con sus esquemas) en backend/src/realtime/application/to-realtime-event.ts
- [ ] T085 [US2] Implementar `RealtimeGateway`: namespace `/realtime`, `clientId` del handshake, `flight:join` con ack `{ ok, seq }`, `flight:leave`, `search:subscribe`, y listeners que emiten los eventos de asiento y `flight:updated` solo a `flight:{id}`, y `flight:stats` (resumen) solo a `search`, según contracts/realtime-events.md, en backend/src/realtime/infrastructure/realtime.gateway.ts
- [ ] T086 [US2] Crear `RealtimeModule` (exporta `EventPublisher`), registrar el job en `SeatsModule` y ambos en `AppModule`, en backend/src/realtime/realtime.module.ts, backend/src/seats/seats.module.ts y backend/src/app.module.ts

**Checkpoint**: T079–T080 pasan; un bloqueo vencido se notifica en ≤ 5 s (CE-003), normalmente ~2 s. Documentación actualizada (principio IX).

---

## Fase 7: HU1 Búsqueda con actualización en vivo (Prioridad: P1)

**Objetivo**: buscar vuelos por ruta y fecha y ver en vivo los cambios de estado y de asientos
disponibles. Incluye la base del frontend que usan las fases 8 y 9.

**Prueba independiente**: en `/search`, BOG → MDE muestra los vuelos del día ordenados; al
cancelar uno desde la api, el resultado muestra CANCELADO sin recargar (quickstart.md § Historia 1).

### Pruebas (escribir primero) ⚠️

- [ ] T087 [P] [US1] Escribir las pruebas de búsqueda: filtra por ruta y día en Bogotá; ordena por `departureAt`; incluye cancelados con su estado; `availableSeats` con vista perezosa; fecha pasada u origen = destino → `422 VALIDATION_ERROR`; sin resultados → `[]`; un retraso que cambia de día mueve el vuelo a la nueva fecha; `GET /api/flights/:id` incluye `seq` y, si no existe, → 404, en backend/test/e2e/flights/search.e2e-spec.ts

### Implementación backend

- [ ] T088 [P] [US1] Implementar la entidad `Flight` pura: `delayed` derivado de data-model.md `flights.departure_at` > `flights.scheduled_departure_at`, `isBookable(now)` según `flights.status`, `durationMinutes` desde `flights.arrival_at`, y transiciones del vuelo de data-model.md, en backend/src/flights/domain/flight.ts
- [ ] T089 [P] [US1] Implementar el rango del día en `America/Bogota` y "hoy" en Bogotá en backend/src/flights/domain/bogota-day.ts
- [ ] T090 [P] [US1] Ampliar el puerto `FlightRepository` con `search` y `getById` (`seq` y `availableSeats` en una sola sentencia) en backend/src/flights/application/ports/flight.repository.ts
- [ ] T091 [US1] Ampliar `PrismaFlightRepository` con `search` (índice `(origin, destination, departure_at)`, conteo perezoso de disponibles) y `getById` en backend/src/flights/infrastructure/prisma-flight.repository.ts
- [ ] T092 [P] [US1] Implementar los casos de uso `SearchFlights` y `GetFlight` en backend/src/flights/application/search-flights.use-case.ts y backend/src/flights/application/get-flight.use-case.ts
- [ ] T093 [US1] Implementar `FlightsController` con `GET /api/flights` y `GET /api/flights/:id` según contracts/openapi.yaml en backend/src/flights/infrastructure/flights.controller.ts
- [ ] T094 [US1] Registrar `FlightsController` y los casos de uso en `FlightsModule` en backend/src/flights/flights.module.ts

### Base del frontend (la usan las fases 8 y 9)

- [ ] T095 [US1] Definir la ruta lazy `/search` y la redirección de `''` a `/search`; las demás rutas se añaden en la fase donde existe su página (T119, T122, T125, T140, T141), en frontend/src/app/app.routes.ts
- [ ] T096 [P] [US1] Crear los tokens de diseño (colores con contraste ≥ 4,5:1, espaciado, tipografía, foco visible) y estilos globales mobile first en frontend/src/styles/tokens.css y frontend/src/styles.scss
- [ ] T097 [P] [US1] Implementar `ClientIdService` (UUID v4 en `localStorage` con try/catch) en frontend/src/app/core/client-id.service.ts
- [ ] T098 [P] [US1] Implementar el interceptor que añade `X-Client-Id` en frontend/src/app/core/client-id.interceptor.ts
- [ ] T099 [P] [US1] Crear el mapa `ErrorCode` → mensaje en español que dice qué pasó y qué hacer (RUX-035, RUX-036); `SEAT_UNAVAILABLE` → "Este asiento ya no está disponible. Elige otro asiento del mapa." en frontend/src/app/core/error-messages.ts
- [ ] T100 [US1] Implementar el interceptor de errores que traduce `code` y muestra un toast de Angular Material en frontend/src/app/core/error.interceptor.ts
- [ ] T101 [P] [US1] Implementar el cliente REST tipado con `@kata/shared` (todas las rutas de contracts/openapi.yaml) en frontend/src/app/core/api.service.ts
- [ ] T102 [US1] Implementar `RealtimeService`: socket tipado al namespace `/realtime` con `auth.clientId`, un Observable por evento, signal `connection` (`connected` | `reconnecting`), registro de rooms y re-join al reconectar, en frontend/src/app/core/realtime.service.ts
- [ ] T103 [P] [US1] Probar `RealtimeService` (estado de conexión, re-join tras reconexión, un Observable por evento) con un socket simulado en frontend/src/app/core/realtime.service.spec.ts
- [ ] T104 [P] [US1] Crear el badge de conexión "conectado" / "reconectando" (RUX-018) y el shell con header en frontend/src/app/shared/ui/connection-badge.component.ts y frontend/src/app/app.ts (convención de Angular 22)

### Implementación del frontend de búsqueda

- [ ] T105 [US1] Implementar el store de resultados: búsqueda REST, `search:subscribe` y, por cada vuelo listado, aplicar `flight:stats` si `seq === última + 1`, descartarlo si `seq <= última` y, ante un salto, pedir `GET /api/flights/:id` agrupando en 250 ms (contracts/realtime-events.md, regla 6); avisos de cambio (`change`) y resincronización al reconectar, en frontend/src/app/features/search/search-results.store.ts
- [ ] T106 [P] [US1] Probar el store de resultados con eventos desordenados, duplicados, con salto (dispara un único `GET /api/flights/:id` agrupado) y de vuelos no listados en frontend/src/app/features/search/search-results.store.spec.ts
- [ ] T107 [P] [US1] Implementar el formulario de búsqueda (origen, destino, fecha; error junto al campo; teclado completo; RUX-021) en frontend/src/app/features/search/search-form.component.ts
- [ ] T108 [P] [US1] Implementar la lista de resultados (salida, llegada, duración, tarifa, estado con texto, disponibles, aviso de retraso con nueva hora, sin selección si CANCELADO o AGOTADO, estado vacío; RUX-022 a RUX-024) en frontend/src/app/features/search/search-results.component.ts
- [ ] T109 [US1] Implementar la página `/search` que compone formulario, resultados y store en frontend/src/app/features/search/search.page.ts

**Checkpoint**: HU1 funciona de punta a punta; un cambio de vuelo se ve en otra pestaña en < 1 s (CE-002). Documentación actualizada (principio IX).

---

## Fase 8: Frontend del mapa de asientos y checkout (US2, US3)

**Objetivo**: mapa accesible en vivo con panel de resumen y cuenta regresiva (US2); pago y
boleto (US3).

**Prueba independiente**: quickstart.md § Historia 2 e Historia 3 con dos ventanas (una en
incógnito).

### Pruebas (escribir primero) ⚠️

- [ ] T110 [P] [US2] Escribir las pruebas del reductor del mapa: aplica solo `seq === última + 1`; descarta duplicados y viejos; un hueco marca `needsResync`; un snapshot reemplaza el estado; reconoce los asientos propios por `holderTag`; `flight:updated` CANCELLED o SOLD_OUT deshabilita el mapa; los contadores derivados siempre suman el total, en frontend/src/app/core/flight-state/flight-state.reducer.spec.ts
- [ ] T111 [P] [US2] Escribir las pruebas de la cuenta regresiva (mm:ss con desfase de `serverNow`, aviso con 60 s o menos, evento al llegar a 0) en frontend/src/app/shared/ui/countdown.component.spec.ts

### Implementación del mapa (US2)

- [ ] T112 [US2] Implementar el reductor puro compartido por mapa y tablero (snapshot, eventos de asiento y de vuelo, propiedad por `holderTag`, `needsResync`, selector de contadores) según contracts/realtime-events.md § Reglas para el cliente en frontend/src/app/core/flight-state/flight-state.reducer.ts
- [ ] T113 [US2] Implementar el store del mapa: `flight:join` → snapshot → aplicar buffer con `seq` mayor; resincronizar ante hueco o reconexión con acciones deshabilitadas mientras tanto (RUX-019, RUX-020); bloqueo optimista con revert ante 409 o 422; liberar; recuperar bloqueos con `GET /api/clients/me/holds`; vencimiento local que limpia el resumen (RUX-014); aviso si el vuelo se cancela con bloqueos propios, en frontend/src/app/features/seat-map/seat-map.store.ts
- [ ] T114 [P] [US2] Crear los iconos o patrones por estado (disponible, mío, de otro, reservado, no disponible; RUX-006) en frontend/src/app/shared/ui/seat-status-icon.component.ts
- [ ] T115 [P] [US2] Crear la leyenda siempre visible (RUX-008) en frontend/src/app/features/seat-map/seat-legend.component.ts
- [ ] T116 [P] [US2] Implementar la cuenta regresiva reutilizable (mm:ss, aviso con 1 minuto o menos, RUX-012 y RUX-013) en frontend/src/app/shared/ui/countdown.component.ts
- [ ] T117 [US2] Implementar el mapa con CSS Grid de botones: 7 columnas (A B C, pasillo, D E F); fila 1–30 numerada a ambos lados; frente del avión indicado; tipo visible; roving tabindex con flechas y Enter o Espacio; `aria-label` "Asiento 12C, pasillo, disponible"; tooltip con código, tipo, precio y estado; resaltado de ~600 ms ante cambios remotos sin mover el foco; región `aria-live`; capa deshabilitada con motivo si CANCELADO o AGOTADO (RUX-001 a RUX-010, RUX-016, RUX-017, RUX-032), en frontend/src/app/features/seat-map/seat-map.component.ts
- [ ] T118 [US2] Implementar el panel de resumen sticky (derecha en escritorio, abajo en pantallas de 640 px o menos): asientos, precio, total, cuenta regresiva y botón de pago habilitado solo con bloqueos vigentes (RUX-011 a RUX-015, RUX-033), en frontend/src/app/features/seat-map/seat-summary-panel.component.ts
- [ ] T119 [US2] Implementar la página `/flights/:id/seats` que compone mapa, leyenda, panel y store, y añadir su ruta lazy, en frontend/src/app/features/seat-map/seat-map.page.ts y frontend/src/app/app.routes.ts

### Implementación del checkout y boleto (US3)

- [ ] T120 [P] [US3] Escribir las pruebas del formulario de pago: un campo de pasajero por asiento con su código; error por campo conservando lo escrito; el botón se deshabilita mientras se procesa y se reactiva si hay rechazo; reutiliza la `Idempotency-Key` en reintentos, en frontend/src/app/features/checkout/checkout-form.component.spec.ts
- [ ] T121 [US3] Implementar el formulario de pago (Angular Material, validación con los esquemas de `@kata/shared`, comprador, pasajeros por código de asiento, tarjeta; RUX-025, RUX-027) en frontend/src/app/features/checkout/checkout-form.component.ts
- [ ] T122 [US3] Implementar la página `/checkout`: recupera bloqueos al recargar, muestra la cuenta regresiva (RUX-026), genera la `Idempotency-Key` al abrir y la renueva tras el éxito, maneja 402, 410 y 422 con opción de volver al mapa y navega al boleto, y añadir su ruta lazy, en frontend/src/app/features/checkout/checkout.page.ts y frontend/src/app/app.routes.ts
- [ ] T123 [P] [US3] Implementar el boleto (código destacado, vuelo, asientos con pasajero, total; RUX-028) en frontend/src/app/features/booking/booking-ticket.component.ts
- [ ] T124 [P] [US3] Implementar el formulario de consulta con código y correo en frontend/src/app/features/booking/booking-lookup.component.ts
- [ ] T125 [US3] Implementar la página `/booking/:code`: usa la reserva recién creada o, si se recarga, pide el correo y consulta con `POST /api/bookings/lookup`, y añadir su ruta lazy, en frontend/src/app/features/booking/booking.page.ts y frontend/src/app/app.routes.ts

**Checkpoint**: HU2 y HU3 funcionan de punta a punta en la UI; un usuario nuevo bloquea un asiento en 3 clics o menos desde los resultados (CE-009). Documentación actualizada (principio IX).

---

## Fase 9: HU4 Tablero y admin (Prioridad: P2)

**Objetivo**: tablero de ocupación en vivo con registro de actividad, y retraso o cancelación
con clave de administrador.

**Prueba independiente**: quickstart.md § Historia 4.

### Pruebas (escribir primero, deben fallar) ⚠️

- [ ] T126 [P] [US4] Escribir las pruebas de admin: sin clave y con clave incorrecta → `401 ADMIN_UNAUTHORIZED`; retraso válido → DELAYED con salida y llegada desplazadas y `flight:updated`; nueva hora no posterior → `422 INVALID_DELAY`; retrasar un vuelo SOLD_OUT conserva SOLD_OUT; cancelar con bloqueos activos libera todos, emite `seat:released` con `FLIGHT_CANCELLED` y un bloqueo posterior da `422 FLIGHT_NOT_BOOKABLE`; cancelar dos veces → `422 FLIGHT_STATUS_CONFLICT`, en backend/test/e2e/admin/update-flight-status.e2e-spec.ts
- [ ] T127 [P] [US4] Escribir las pruebas del tablero: `GET /api/flights/:id/stats` suma `total` = 180 con vista perezosa y `occupancyPercent` = reservados ÷ total; `GET /api/flights/:id/events` devuelve los últimos 50, el más reciente primero, en backend/test/e2e/flights/stats-events.e2e-spec.ts

### Implementación backend

- [ ] T128 [P] [US4] Implementar los casos de uso `GetFlightStats` y `GetFlightEvents` en backend/src/flights/application/get-flight-stats.use-case.ts y backend/src/flights/application/get-flight-events.use-case.ts
- [ ] T129 [US4] Añadir `GET /api/flights/:id/stats` y `GET /api/flights/:id/events?limit=50` en backend/src/flights/infrastructure/flights.controller.ts
- [ ] T130 [US4] Ampliar `PrismaFlightRepository` con `delay` (data-model.md `flights.departure_at` y `flights.arrival_at` desplazados; `flights.status` DELAYED salvo SOLD_OUT) y `cancel` (`flights.status` CANCELLED); solo escribe la tabla `flights`, en backend/src/flights/infrastructure/prisma-flight.repository.ts
- [ ] T131 [US4] Implementar `PrismaSeatHoldRepository.releaseAllHeld(flightId)` (`UPDATE seats ... WHERE flight_id = :f AND status = 'HELD' RETURNING`, sobre data-model.md `seats.status`, `seats.held_by` y `seats.hold_expires_at`) en backend/src/seats/infrastructure/prisma-seat-hold.repository.ts
- [ ] T132 [P] [US4] Implementar `AdminKeyGuard` (compara `X-Admin-Key` con `ADMIN_KEY` mediante `timingSafeEqual`; `401 ADMIN_UNAUTHORIZED`) en backend/src/admin/infrastructure/admin-key.guard.ts
- [ ] T133 [US4] Implementar el caso de uso `UpdateFlightStatus` orquestando en `UnitOfWork`: `FlightWriteLock` (`notCancelled`; si no, `422 FLIGHT_STATUS_CONFLICT`), reglas de transición de la API pública de `flights`, `FlightRepository.delay` o `cancel`, al cancelar `SeatHoldRepository.releaseAllHeld` (API pública de `seats`) y `FlightEventLog.append`; tras el commit publica `FlightUpdated`, `SeatReleased` con `FLIGHT_CANCELLED` y `FlightStatsChanged`, en backend/src/admin/application/update-flight-status.use-case.ts
- [ ] T134 [US4] Implementar `AdminController` (`PATCH /api/admin/flights/:id/status`) y `AdminModule`, y registrarlo, en backend/src/admin/infrastructure/admin.controller.ts, backend/src/admin/admin.module.ts y backend/src/app.module.ts

### Implementación frontend

- [ ] T135 [US4] Implementar el store del tablero con el reductor compartido de `core/flight-state`: snapshot `GET /api/flights/:id/seats` + `GET /api/flights/:id/events`, `flight:join`, aplicar solo `seq === última + 1`, descartar `seq <= última` y, ante un salto o una reconexión, volver a pedir el snapshot; contadores derivados del estado; cada evento se antepone al registro, en frontend/src/app/features/dashboard/dashboard.store.ts
- [ ] T136 [P] [US4] Probar el store del tablero (contadores que siempre suman el total, orden del registro, eventos duplicados y salto → nuevo snapshot) en frontend/src/app/features/dashboard/dashboard.store.spec.ts
- [ ] T137 [P] [US4] Crear las tarjetas de contadores en frontend/src/app/features/dashboard/stats-cards.component.ts
- [ ] T138 [P] [US4] Crear la barra de ocupación proporcional y accesible (RUX-029) en frontend/src/app/features/dashboard/occupancy-bar.component.ts
- [ ] T139 [P] [US4] Crear el registro de actividad con hora, tipo y asiento (RUX-030). El tipo se traduce desde `type` y `reason`: `SEAT_RELEASED` con `EXPIRED` → "vencimiento", con `MANUAL` → "liberación", con `FLIGHT_CANCELLED` → "liberación por cancelación"; `SEAT_HELD` → "bloqueo"; `SEAT_BOOKED` → "reserva"; `FLIGHT_UPDATED` → "cambio de estado del vuelo" en frontend/src/app/features/dashboard/activity-log.component.ts
- [ ] T140 [US4] Implementar la página `/flights/:id/dashboard` (RUX-031) y añadir su ruta lazy en frontend/src/app/features/dashboard/dashboard.page.ts y frontend/src/app/app.routes.ts
- [ ] T141 [US4] Implementar la página `/admin` (clave en `sessionStorage`, vuelo, retraso con nueva hora o cancelación, mensajes de 401 y 422) y añadir su ruta lazy en frontend/src/app/features/admin/admin.page.ts y frontend/src/app/app.routes.ts

**Checkpoint**: HU4 funciona; los contadores siempre suman 180 (CE-005). Documentación actualizada (principio IX).

---

## Fase 10: Documentación y cierre

**Propósito**: entregables del principio IX y validación final.

- [ ] T142 [P] Completar y revisar el README (qué es, `docker compose up`, desarrollo local, scripts, pruebas, variables, tarjeta de rechazo, clave de admin de demo, estructura, sección de tiempos medidos) en README.md
- [ ] T143 [P] Completar y revisar la arquitectura (diagrama de módulos hexagonales con `UnitOfWork` y primitivas compartidas, flujo comando → commit → evento, estrategia de concurrencia con UPDATE condicional, orden de locks y advisory lock, reloj compartido, idempotencia, expiración con barrido de 2 s y vista perezosa, `seq` y resincronización, `holderTag`, decisiones y alternativas) en docs/architecture.md
- [ ] T144 [P] Completar el uso de IA (herramientas, flujo Spec Kit constitución → spec → clarify → plan → tasks, prompts en docs/prompts/, qué se revisó y corrigió a mano) en docs/ia.md
- [ ] T145 [P] (Opcional) Crear la prueba de dos pestañas con Playwright (dos contextos de navegador: un bloqueo se ve en el otro en < 1 s; clic simultáneo → uno gana) en e2e/two-tabs.spec.ts y e2e/playwright.config.ts
- [ ] T146 Revisar la accesibilidad (flujo completo solo con teclado, lector de pantalla en el mapa, contraste ≥ 4,5:1, panel inferior en móvil; RUX-010, RUX-032 a RUX-034) y ajustar tokens en frontend/src/styles/tokens.css
- [ ] T147 Ejecutar `docker compose up --build` desde cero y la validación completa de quickstart.md; medir y anotar en la sección de tiempos del README la propagación entre pestañas (CE-002, CE-010), la notificación de vencimiento (CE-003) y la resincronización (CE-008); corregir desviaciones en specs/001-realtime-flight-booking/quickstart.md y README.md
- [ ] T148 Verificar las puertas de calidad de la constitución (`pnpm lint`, `pnpm typecheck`, `pnpm test` con las pruebas del principio V) y registrar el resultado en docs/architecture.md

---

## Dependencias y orden de ejecución

### Dependencias entre fases

```text
F1 Setup ─▶ F2 Shared ─▶ F3 Backend base ─┬─▶ F4 HU2 bloqueos ─┬─▶ F5 HU3 reservas
                                          │                    └─▶ F6 Expiración + Gateway
                                          └─▶ F7 HU1 búsqueda (backend + base frontend)
F4 + F6 + F7 ─▶ F8 Frontend mapa (US2)
F5 + F8      ─▶ F8 Checkout (US3)
F3 + F6 + F7 ─▶ F9 HU4 tablero y admin
Todas        ─▶ F10 Documentación y cierre
```

- **F1 → F2 → F3**: secuenciales y bloqueantes.
- **F4 (US2)**: depende de F3; es el núcleo del reto.
- **F5 (US3)**: depende de F4 (necesita bloqueos para confirmar).
- **F6**: depende de F4; puede ir en paralelo con F5.
- **F7 (US1)**: el backend depende solo de F3 y puede ir en paralelo con F4–F6; la parte de
  frontend en vivo necesita el gateway de F6 para verse funcionando.
- **F8**: el mapa (US2) depende de F4, F6 y de la base frontend de F7; el checkout (US3)
  depende además de F5.
- **F9 (US4)**: el backend depende de F3 (y de F6 para difundir); el frontend, de la base de F7.
- **F10**: al final, aunque la documentación puede empezarse antes (principio IX).

### Dentro de cada fase

- Las pruebas marcadas "escribir primero" se escriben y fallan antes de implementar.
- Dominio → puertos → adaptadores → casos de uso → controladores o gateway → módulo.
- Cada repositorio escribe solo las tablas de su módulo. Las operaciones entre módulos las
  orquesta un caso de uso con `UnitOfWork` (principio IV, research.md §3).
- Al cerrar cada fase, actualizar README.md, docs/architecture.md y docs/ia.md con lo que la
  fase introduce (principio IX).
- Las tareas que tocan el mismo archivo son secuenciales (por ejemplo T056 → T057 → T071 → T081 → T131 en
  `prisma-seat-hold.repository.ts`; T043 → T091 → T130 en `prisma-flight.repository.ts`;
  T093 → T129 en `flights.controller.ts`; T095 → T119 → T122 → T125 → T140 → T141 en
  `app.routes.ts`).

### Oportunidades de paralelismo

- **F1**: T003–T013 y T015 en paralelo tras T001–T002.
- **F2**: T016–T022 en paralelo; luego T023; T024 en paralelo.
- **F3**: T027, T029–T033 y T035–T038 en paralelo (T028 tras T027); T040, T041, T042 y T048 en paralelo.
- **Tras F3**: un desarrollador en F4 → F5 y otro en el backend de F7, más la base del
  frontend (T095–T104).

---

## Ejemplos de ejecución en paralelo

### Fase 4 (HU2)

```bash
# Pruebas primero, en paralelo:
Task: "Prueba de concurrencia 100 → 1 en backend/test/e2e/seats/hold-concurrency.e2e-spec.ts"
Task: "Reglas de bloqueo en backend/test/e2e/seats/hold-rules.e2e-spec.ts"
Task: "Política de bloqueo en backend/test/unit/seats/hold-policy.spec.ts"

# Piezas independientes:
Task: "Política pura en backend/src/seats/domain/hold-policy.ts"
Task: "holderTag en backend/src/seats/application/holder-tag.ts"
Task: "Puerto SeatHoldRepository en backend/src/seats/application/ports/seat-hold.repository.ts"
```

### Fase 5 (HU3)

```bash
Task: "Confirmación en backend/test/e2e/bookings/create-booking.e2e-spec.ts"
Task: "Idempotencia en backend/test/e2e/bookings/idempotency.e2e-spec.ts"
Task: "Consulta en backend/test/e2e/bookings/lookup.e2e-spec.ts"
Task: "FakePaymentGateway en backend/src/bookings/infrastructure/fake-payment.gateway.ts"
Task: "Código de reserva en backend/src/bookings/domain/booking-code.ts"
```

### Fase 7 (HU1, base del frontend)

```bash
Task: "Tokens en frontend/src/styles/tokens.css"
Task: "ClientIdService en frontend/src/app/core/client-id.service.ts"
Task: "Mensajes de error en frontend/src/app/core/error-messages.ts"
Task: "Cliente REST en frontend/src/app/core/api.service.ts"
```

### Fase 9 (HU4)

```bash
Task: "Tarjetas en frontend/src/app/features/dashboard/stats-cards.component.ts"
Task: "Barra en frontend/src/app/features/dashboard/occupancy-bar.component.ts"
Task: "Registro en frontend/src/app/features/dashboard/activity-log.component.ts"
```

---

## Estrategia de implementación

### MVP primero

1. F1 → F2 → F3 (base).
2. F4 (HU2): **parar y validar** la prueba de concurrencia 100 → 1 contra PostgreSQL real. Es
   el criterio más importante de la prueba técnica.
3. F5 (HU3) y F6: el flujo de bloqueo → confirmación queda completo y notificado.
4. F7 + F8: la UI de búsqueda, mapa y pago hacen demostrable el MVP de punta a punta.

### Entrega incremental

1. Base lista (F1–F3) → `docker compose up` sano con datos de prueba.
2. \+ F4 → bloqueos correctos por API (demostrable con curl).
3. \+ F5 + F6 → reservas e idempotencia; eventos en vivo.
4. \+ F7 → búsqueda en vivo en la UI.
5. \+ F8 → mapa, pago y boleto en la UI (MVP completo).
6. \+ F9 → tablero y admin.
7. \+ F10 → documentación y validación final.

### Si el tiempo se acaba (prototipo de 1 día)

Recortar en este orden, sin tocar las pruebas del principio V: T145 (Playwright opcional),
T136, T106, T103 (pruebas de stores secundarios), detalles visuales de T137–T139.

---

## Notas

- [P] = archivos distintos y sin dependencias pendientes.
- La etiqueta [USn] traza cada tarea a su historia de [spec.md](./spec.md).
- Verificar que las pruebas fallan antes de implementar.
- Hacer commit con Conventional Commits tras cada tarea o grupo lógico.
- Actualizar README.md y docs/architecture.md en el mismo cambio si cambia el diseño
  (principio IX).
