---

description: "Lista de tareas de implementación: Reservas de vuelos en tiempo real"
---

# Tareas: Reservas de vuelos en tiempo real

**Entrada**: documentos de diseño en `/specs/001-realtime-flight-booking/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: incluidas. La constitución 1.1.0 (principio V) exige escribir antes de la
implementación las pruebas de concurrencia, expiración, confirmación con bloqueo vencido,
idempotencia y cancelación con bloqueos activos, y las pruebas unitarias de cada caso de uso con
dobles de sus puertos, con cobertura ≥ 80 % en domain/, application/ y shared/. Cada prueba
marcada "escribir primero" debe fallar antes de implementar.

**Organización**: 10 fases en el orden pedido, más la fase 3b (calidad y seguridad base de la
constitución 1.1.0), que se ejecuta antes de la fase 4. Las fases de historia llevan la etiqueta de la
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

## Fase 3b: Calidad y seguridad base (constitución 1.1.0)

**Propósito**: llevar la base ya implementada (fases 1–3) a la constitución 1.1.0 antes de las
historias: reglas de complejidad, cobertura medida, seguridad (principio X), puertos segregados
(I de SOLID), objetos de dependencias y dobles de prueba. Incluye los pendientes del Sync Impact
Report.

**⚠️ CRÍTICO**: el siguiente bloque ejecuta esta fase primero; ninguna historia empieza antes.

### Calidad y cobertura

- [ ] T050 Añadir a ESLint `complexity` ≤ 10, `max-lines-per-function` ≤ 40 (sin líneas en blanco ni comentarios; las pruebas quedan exentas solo de esta regla), `max-params` ≤ 4, `no-console` sin excepción para `log`, y en el frontend `no-restricted-properties` para `innerHTML`/`outerHTML` y `no-restricted-syntax` para `bypassSecurityTrust*`; crear la verificación de plantillas (falla si un `.html` usa `[innerHTML]` o `bypassSecurityTrust`) y encadenarla al script `lint`. Prueba: lint de fragmentos que violan cada regla con la API de ESLint, en eslint.config.mjs, scripts/check-templates.mjs, package.json y backend/test/unit/tooling/eslint-rules.spec.ts
- [ ] T051 Refactorizar el código existente que supera los nuevos límites (funciones de más de 40 líneas en el seed, entre otras) sin cambiar su comportamiento; verificación: `pnpm lint` en verde y `pnpm seed` con los mismos conteos (420 vuelos, 75.600 asientos, 45 reservas), en backend/prisma/seed.ts
- [ ] T052 Crear `test:cov` en shared (Jest con `coverageThreshold` global de 80 % en líneas y ramas), en backend (Jest unitario con `collectCoverageFrom` en `src/**/domain/**` y `src/**/application/**` y el mismo umbral) y en frontend (Vitest con reporte de cobertura, sin umbral), y el script raíz `pnpm test:cov`; verificación: el comando falla si algún umbral baja del 80 %, en package.json, shared/package.json, shared/jest.config.ts, backend/package.json, backend/jest.config.ts y frontend/package.json
- [ ] T053 [P] Ampliar las pruebas de esquemas de shared con casos válidos e inválidos de todos los esquemas (`SeatDto`, `SeatMapSnapshot`, `HoldSeatResponse`, `MyHoldsResponse`, `FlightDto`, `FlightStatsDto`, `ActivityEntryDto`, `UpdateFlightStatusRequest`, `BookingDto`, eventos de tiempo real y acks) hasta superar el 80 % de líneas y ramas, en shared/test/schemas.spec.ts y shared/test/realtime-events.spec.ts

### Seguridad (principio X) y pendientes del Sync Impact Report

- [ ] T054 Crear `ClientIdSchema` (UUID v4) en shared y usarlo en `@ClientId()`: sin header, UUID de otra versión, valor no UUID o header repetido → `400 CLIENT_ID_REQUIRED`. Prueba unitaria con v4 válido, v1, v5, texto y ausencia, en shared/src/schemas/client-id.schema.ts, shared/src/index.ts, backend/src/shared-kernel/infrastructure/http/client-id.decorator.ts y backend/test/unit/shared-kernel/client-id.decorator.spec.ts
- [ ] T055 [P] Crear `holderTagOf(clientId)` (primeros 16 hex de SHA-256; único sitio que lo calcula, research.md §15) con su prueba unitaria (16 hex, determinista, distinto por cliente, no contiene el `clientId`), en backend/src/shared-kernel/domain/holder-tag.ts y backend/test/unit/shared-kernel/holder-tag.spec.ts
- [ ] T056 Cambiar el logger: `redact` de `req.headers["x-client-id"]`, `req.headers["x-admin-key"]`, `authorization` y datos de tarjeta; contexto con `holderTag` en lugar de `clientId`; extraer `buildPinoHttpOptions(config)` puro. Prueba unitaria: un log escrito en un stream en memoria no contiene el `clientId`, la clave de admin, el número ni el CVV, y sí el `holderTag`, en backend/src/shared-kernel/infrastructure/logger.module.ts y backend/test/unit/shared-kernel/logger-options.spec.ts
- [ ] T057 Endurecer HTTP: helmet, CORS restringido a `CORS_ORIGINS` (por defecto `http://localhost:4200,http://localhost:8080`), límite de body JSON `BODY_LIMIT` de 16 kb (exceso → `400 BAD_REQUEST`); nuevas variables en la configuración, `.env.example` y docker-compose.yml. Prueba e2e: cabeceras de helmet, preflight desde origen permitido y no permitido, body de 32 kb → 400 con el formato único, en backend/src/app.setup.ts, backend/src/shared-kernel/infrastructure/config.ts, .env.example, docker-compose.yml y backend/test/e2e/security/http-hardening.e2e-spec.ts
- [ ] T058 Reforzar el filtro de errores: ninguna respuesta incluye `stack`, SQL ni el mensaje original de una excepción desconocida; los errores del body parser (incluido 413) → `400 BAD_REQUEST`; `ThrottlerException` → `429 TOO_MANY_REQUESTS` con "Demasiados intentos, espera un momento." y cabecera `Retry-After`; añadir `TOO_MANY_REQUESTS` (429) a `ERROR_HTTP_STATUS`. Prueba unitaria ampliada con un error que lleva stack y SQL, un P2002 genérico y un 429, en shared/src/errors/index.ts, backend/src/shared-kernel/infrastructure/http/error.filter.ts y backend/test/unit/shared-kernel/api-exception.filter.spec.ts
- [ ] T059 Configurar `@nestjs/throttler` global con dos contadores con nombre: `ip` (siempre) y `client` (`X-Client-Id` válido, solo en bloqueo, liberación y confirmación); límites por ruta de research.md §25 en un único archivo con multiplicador `RATE_LIMIT_MULTIPLIER`; `/health` exento; el arnés e2e sube el multiplicador salvo en las pruebas de límites. Prueba e2e con un controlador de prueba que usa el límite de bloqueos: al superarlo → 429 con el formato único; otro cliente desde otra IP no se ve afectado, y rotar `X-Client-Id` desde la misma IP no evade el contador por IP, en backend/src/shared-kernel/infrastructure/http/rate-limits.ts, backend/src/app.module.ts, backend/test/e2e/support/test-app.ts y backend/test/e2e/security/rate-limit.e2e-spec.ts
- [ ] T060 [P] Implementar `AdminKeyGuard`: compara `X-Admin-Key` con `ADMIN_KEY` mediante `timingSafeEqual` sobre los hashes SHA-256 de ambos (misma longitud); ausente o incorrecta → `401 ADMIN_UNAUTHORIZED`. Prueba unitaria con clave correcta, incorrecta, ausente, de otra longitud y header repetido, en backend/src/admin/infrastructure/admin-key.guard.ts y backend/test/unit/admin/admin-key.guard.spec.ts
- [ ] T061 Implementar la validación del socket: middleware de handshake que valida `auth.clientId` con `ClientIdSchema` (si no es válido, `connect_error` con `CLIENT_ID_REQUIRED`) y validador de payloads cliente → servidor con `FlightRoomPayloadSchema` (ack `{ ok: false, code: 'VALIDATION_ERROR' }`); ampliar `FlightJoinAck` en shared. Prueba unitaria del middleware y del validador, en backend/src/realtime/infrastructure/socket-handshake.ts, shared/src/realtime/events.ts y backend/test/unit/realtime/socket-handshake.spec.ts
- [ ] T062 Guardar la marca de la tarjeta: `CardBrand` y `detectCardBrand(number)` en shared (reglas de data-model.md); columna data-model.md `bookings.card_brand` en el esquema Prisma y migración `0002_card_brand`; el seed guarda `VISA` en sus reservas; `BookingDto.cardBrand`. Pruebas: unitaria de `detectCardBrand` (cada marca y `OTHER`) y el arnés e2e aplica la migración, en shared/src/domain/card-brand.ts, shared/src/schemas/booking.schema.ts, shared/test/card-brand.spec.ts, backend/prisma/schema.prisma, backend/prisma/migrations/0002_card_brand/migration.sql y backend/prisma/seed.ts

### Puertos segregados, objetos de dependencias y dobles (SOLID)

- [ ] T063 Segregar el puerto del módulo flights (I de SOLID): `FlightRepository` pasa a `FlightStatusPort` (`markSoldOutIfFull`; se amplía con `delay` y `cancel` en la fase 9) con su adaptador `PrismaFlightStatusAdapter`; `FlightQueryPort` llega en la fase 7; actualizar el módulo y la API pública. Prueba de integración contra PostgreSQL: marca SOLD_OUT solo con todos los asientos BOOKED y no cambia un vuelo CANCELLED (data-model.md `flights.status`), en backend/src/flights/application/ports/flight-status.port.ts, backend/src/flights/infrastructure/persistence/prisma-flight-status.adapter.ts, backend/src/flights/flights.module.ts, backend/src/flights/index.ts y backend/test/e2e/flights/flight-status.adapter.e2e-spec.ts
- [ ] T064 Crear el objeto de dependencias `FlightWriteContext` (`UnitOfWork`, `FlightWriteLock`, `FlightEventLog`, `FlightStatsReader`, `EventPublisher` y `Clock`) con su token y un proveedor `useFactory` (los casos de uso son clases planas sin decoradores de Nest y cada módulo los registra con `useFactory` + `inject`), para que los casos de uso respeten `max-params` ≤ 4 (research.md §24). Prueba unitaria: el módulo resuelve el contexto con las seis dependencias, en backend/src/shared-kernel/application/flight-write-context.ts, backend/src/shared-kernel/shared-kernel.module.ts y backend/test/unit/shared-kernel/flight-write-context.spec.ts
- [ ] T065 Crear los dobles de los puertos transversales: `InMemoryUnitOfWork` (registra commit y rollback), `StubFlightWriteLock` (condición configurable que lanza los errores de dominio), `InMemoryFlightEventLog` (`seq` consecutivas), `StubFlightStatsReader`, `RecordingEventPublisher` y el helper `buildFlightWriteContext()`, en backend/test/doubles/shared-kernel.doubles.ts
- [ ] T066 Crear las pruebas de contrato compartidas (L de SOLID) de `Clock` y `EventPublisher` y aplicarlas a `SystemClock` y `FakeClock`, y a `EventEmitterPublisher` y `RecordingEventPublisher`, en backend/test/contracts/clock.contract.ts, backend/test/contracts/event-publisher.contract.ts y backend/test/unit/contracts/shared-kernel.contract.spec.ts

**Checkpoint**: `pnpm typecheck`, `pnpm lint` (con complejidad y plantillas), `pnpm test` y `pnpm test:cov` en verde; cabeceras de seguridad, CORS, límite de body, 429 y redact verificados por pruebas. Documentación actualizada (principio IX).

---

## Fase 4: HU2 Bloqueos de asientos (Prioridad: P1) 🎯 MVP

**Objetivo**: bloquear y liberar asientos sin doble bloqueo, con límite de 4 y reloj compartido.

**Prueba independiente**: las pruebas e2e de esta fase pasan contra PostgreSQL real; con curl
se bloquea, se recupera y se libera un asiento (quickstart.md § Prueba rápida por la API).

### Pruebas de HU2 (escribir primero, deben fallar) ⚠️

- [ ] T067 [P] [US2] Escribir la prueba de concurrencia: 100 `POST /api/flights/:id/seats/12C/hold` en paralelo con `clientId` distintos → exactamente 1 respuesta 201, 99 respuestas `409 SEAT_UNAVAILABLE` y ningún 500; en la base hay un solo asiento HELD con el `held_by` del ganador, en backend/test/e2e/seats/hold-concurrency.e2e-spec.ts
- [ ] T068 [P] [US2] Escribir las pruebas de reglas de bloqueo: reloj compartido (con `FakeClock` avanzado, el segundo asiento recibe el mismo `holdExpiresAt`); quinto bloqueo → `422 HOLD_LIMIT_REACHED`; liberar el propio → 204 y ajeno → `409 SEAT_NOT_HELD`; vuelo cancelado, agotado o ya salido → `422 FLIGHT_NOT_BOOKABLE`; toma de un bloqueo vencido por otro cliente → 201; sin `X-Client-Id` o con un UUID que no es v4 → 400; `GET /api/clients/me/holds` devuelve asientos, vencimiento y `holderTag`; el snapshot de `GET /api/flights/:id/seats` trae una `seq` coherente con los asientos, en backend/test/e2e/seats/hold-rules.e2e-spec.ts
- [ ] T069 [P] [US2] Escribir las pruebas unitarias de la política de bloqueo (límite, cálculo del vencimiento compartido, vencido según `Clock`) en backend/test/unit/seats/hold-policy.spec.ts
- [ ] T070 [P] [US2] Definir los puertos segregados de asientos: `SeatHoldsPort` (`tryHold`, `release`), `SeatQueryPort` (`getSeatMap`, `getClientHolds`), `SeatBookingPort` (`markBooked`) y `SeatReleasePort` (`findFlightsWithExpiredHolds`, `releaseExpired`, `releaseAllHeld`), en backend/src/seats/application/ports/seat-holds.port.ts, backend/src/seats/application/ports/seat-query.port.ts, backend/src/seats/application/ports/seat-booking.port.ts y backend/src/seats/application/ports/seat-release.port.ts
- [ ] T071 [US2] Crear los dobles en memoria de los cuatro puertos de asientos (un almacén en memoria con vista perezosa de vencimientos, límite de 4 y reloj compartido) en backend/test/doubles/seats.doubles.ts
- [ ] T072 [P] [US2] Escribir las pruebas unitarias de `HoldSeatUseCase` con dobles: camino feliz con `seq` y `holderTag`; vuelo no reservable → `FLIGHT_NOT_BOOKABLE` sin escribir; asiento tomado → `SEAT_UNAVAILABLE` sin publicar; los eventos se publican solo tras el commit; rollback ante error, en backend/test/unit/seats/hold-seat.use-case.spec.ts
- [ ] T073 [P] [US2] Escribir las pruebas unitarias de `ReleaseSeatUseCase` con dobles (propio → liberado y `SeatReleased` con `MANUAL`; ajeno o vencido → `SEAT_NOT_HELD` sin publicar) en backend/test/unit/seats/release-seat.use-case.spec.ts
- [ ] T074 [P] [US2] Escribir las pruebas unitarias de `GetSeatMapUseCase` y `GetMyHoldsUseCase` con dobles (vuelo inexistente → `FLIGHT_NOT_FOUND`; bloqueos vencidos se ven disponibles; mis bloqueos agrupados por vuelo) en backend/test/unit/seats/seat-queries.use-case.spec.ts

### Implementación de HU2

- [ ] T075 [P] [US2] Implementar la política de bloqueo pura: `MAX_HOLDS_PER_FLIGHT = 4`, `computeExpiry(existing, now, ttl)` y `isExpired` para data-model.md `seats.hold_expires_at`, en backend/src/seats/domain/hold-policy.ts
- [ ] T076 [US2] Implementar `PrismaSeatHoldsAdapter` dentro de la transacción activa de `UnitOfWork` (research.md §6–§7): `tryHold` con `pg_advisory_xact_lock(clientId, flightId)` → conteo y vencimiento común de los bloqueos vigentes del cliente → `seat.updateMany` condicional sobre data-model.md `seats.status`, `seats.held_by`, `seats.hold_expires_at` y `seats.version` (count 0 → `SEAT_UNAVAILABLE`); `release` con UPDATE condicional `HELD → AVAILABLE` del dueño vigente (count 0 → `SEAT_NOT_HELD`); solo escribe la tabla `seats`, en backend/src/seats/infrastructure/persistence/prisma-seat-holds.adapter.ts
- [ ] T077 [P] [US2] Implementar `PrismaSeatQueryAdapter`: `getSeatMap` (vista perezosa, `holderTag` con `holderTagOf`, `seq` y `serverNow` leídos en una transacción `REPEATABLE READ` de solo lectura según research.md §13) y `getClientHolds`, en backend/src/seats/infrastructure/persistence/prisma-seat-query.adapter.ts
- [ ] T078 [US2] Implementar `HoldSeatUseCase` (parámetros: `FlightWriteContext` y `SeatHoldsPort`) orquestando en `UnitOfWork` `FlightWriteLock` (`bookable`) → `SeatHoldsPort.tryHold` → `FlightEventLog.append` → `FlightStatsReader`; tras el commit publica `SeatHeld` y `FlightStatsChanged`, en backend/src/seats/application/hold-seat.use-case.ts
- [ ] T079 [P] [US2] Implementar `ReleaseSeatUseCase` (en `UnitOfWork`: `FlightWriteLock` (`any`) → `SeatHoldsPort.release` → `FlightEventLog.append`; tras el commit publica `SeatReleased` con `MANUAL` y `FlightStatsChanged`) en backend/src/seats/application/release-seat.use-case.ts
- [ ] T080 [P] [US2] Implementar `GetSeatMapUseCase` y `GetMyHoldsUseCase` sobre `SeatQueryPort` en backend/src/seats/application/get-seat-map.use-case.ts y backend/src/seats/application/get-my-holds.use-case.ts
- [ ] T081 [US2] Implementar `SeatsController` sin lógica de negocio: `POST` y `DELETE /api/flights/:id/seats/:seatId/hold` (límite de bloqueos del throttler), `GET /api/flights/:id/seats` y `GET /api/clients/me/holds`; params validados con los esquemas de shared (`flightId` uuid, `seatId` código) y `@ClientId()`, según contracts/openapi.yaml, en backend/src/seats/infrastructure/seats.controller.ts
- [ ] T082 [US2] Crear `SeatsModule` (cada puerto → su adaptador), su API pública (tokens de `SeatBookingPort` y `SeatReleasePort` para bookings y admin) y registrarlo, en backend/src/seats/seats.module.ts, backend/src/seats/index.ts y backend/src/app.module.ts

**Checkpoint**: T067–T074 pasan; 0 dobles bloqueos con 100 solicitudes simultáneas (CE-001); cobertura ≥ 80 % en seats/domain y seats/application. Documentación actualizada (principio IX).

---

## Fase 5: HU3 Reservas con idempotencia y pago ficticio (Prioridad: P1)

**Objetivo**: confirmar todo o nada los bloqueos vigentes del cliente, con código único, pago
ficticio, idempotencia y consulta del boleto con código y correo.

**Prueba independiente**: las pruebas e2e de esta fase pasan; con curl se bloquea, se confirma
y se consulta el boleto.

### Pruebas de HU3 (escribir primero, deben fallar) ⚠️

- [ ] T083 [P] [US3] Escribir las pruebas e2e de confirmación: éxito → 201, asientos BOOKED, código `^[A-Z0-9]{6}$` y total = tarifa × asientos; en la base solo quedan marca y últimos 4 dígitos de la tarjeta; bloqueo vencido (`FakeClock`) → `410 HOLD_EXPIRED` sin reserva; tarjeta `4000000000000002` → `402 PAYMENT_DECLINED` con los bloqueos intactos; pasajeros que no cubren todos los bloqueos → `422 PASSENGERS_MISMATCH`; vuelo cancelado → `422 FLIGHT_NOT_BOOKABLE`; reservar el último asiento → vuelo `SOLD_OUT`, en backend/test/e2e/bookings/confirm-booking.e2e-spec.ts
- [ ] T084 [P] [US3] Escribir las pruebas e2e de idempotencia: misma `Idempotency-Key` dos veces → 201 y luego 200 con `Idempotent-Replayed: true` y el mismo código; dos envíos concurrentes con la misma clave → una sola reserva; misma clave con otro cuerpo → `422 IDEMPOTENCY_KEY_REUSED`; sin clave → `400 IDEMPOTENCY_KEY_REQUIRED`, en backend/test/e2e/bookings/idempotency.e2e-spec.ts
- [ ] T085 [P] [US3] Escribir las pruebas e2e de consulta: código y correo correctos → 200 (correo sin distinguir mayúsculas) con `cardBrand` y `cardLast4`; correo incorrecto → 404 `BOOKING_NOT_FOUND`; código inexistente → 404 con el mismo mensaje, en backend/test/e2e/bookings/lookup.e2e-spec.ts
- [ ] T086 [P] [US3] Escribir las pruebas unitarias del generador de código de reserva en backend/test/unit/bookings/booking-code.spec.ts
- [ ] T087 [P] [US3] Escribir la prueba de contrato compartida de `PaymentGateway` (L de SOLID): aprueba tarjetas válidas devolviendo marca y últimos 4; rechaza la tarjeta de prueba con un resultado (sin excepción); no muta la entrada ni conserva datos de tarjeta; y aplicarla a `FakePaymentGateway` y `ScriptedPaymentGateway`, en backend/test/contracts/payment-gateway.contract.ts y backend/test/unit/contracts/payment-gateway.contract.spec.ts
- [ ] T088 [P] [US3] Crear los dobles de bookings: `InMemoryIdempotencyStore`, `InMemoryBookingStore` (también implementa `BookingLookupPort`), `ScriptedPaymentGateway` y `StubFlightStatusPort`, en backend/test/doubles/bookings.doubles.ts
- [ ] T089 [US3] Escribir las pruebas unitarias de `ConfirmBookingUseCase` con dobles: éxito con marca y últimos 4; bloqueos vencidos → `HOLD_EXPIRED` y rollback; pasajeros incompletos → `PASSENGERS_MISMATCH`; pago rechazado → `PAYMENT_DECLINED`, rollback y nada publicado; misma clave → `replayed` sin cobrar de nuevo; misma clave con otro cuerpo → `IDEMPOTENCY_KEY_REUSED`; último asiento → `FlightUpdated` con `SOLD_OUT`; eventos solo tras el commit, en backend/test/unit/bookings/confirm-booking.use-case.spec.ts
- [ ] T090 [P] [US3] Escribir las pruebas unitarias de `LookupBookingUseCase` (normaliza código y correo; mismo 404 por código o correo incorrecto) en backend/test/unit/bookings/lookup-booking.use-case.spec.ts

### Implementación de HU3

- [ ] T091 [P] [US3] Implementar el generador de código de reserva aleatorio para data-model.md `bookings.code` en backend/src/bookings/domain/booking-code.ts
- [ ] T092 [P] [US3] Definir el puerto `PaymentGateway` (`charge({ amount, card })`: la tarjeta solo en memoria; devuelve aprobado con marca y últimos 4 o rechazado con motivo) en backend/src/bookings/application/ports/payment-gateway.port.ts
- [ ] T093 [P] [US3] Implementar `FakePaymentGateway` (rechaza `4000000000000002`, aprueba el resto; marca con `detectCardBrand`; nunca registra la tarjeta) en backend/src/bookings/infrastructure/fake-payment.gateway.ts
- [ ] T094 [P] [US3] Definir los puertos `BookingStore` (`save`), `BookingLookupPort` (`findByCodeAndEmail`) e `IdempotencyStore` (`reserve`, `attach`), y el objeto de dependencias `BookingPorts` (`IdempotencyStore`, `SeatBookingPort`, `PaymentGateway`, `BookingStore`, `FlightStatusPort`), en backend/src/bookings/application/ports/booking-store.port.ts, backend/src/bookings/application/ports/booking-lookup.port.ts, backend/src/bookings/application/ports/idempotency-store.port.ts y backend/src/bookings/application/ports/booking-ports.ts
- [ ] T095 [P] [US3] Implementar `PrismaSeatBookingAdapter.markBooked` (UPDATE condicional `HELD → BOOKED` sobre data-model.md `seats.status`, con `seats.held_by` y `seats.hold_expires_at` vigentes y `(row, letter) IN (...)`, `RETURNING id`; informa además si quedan otros bloqueos vigentes del cliente en el vuelo) en backend/src/seats/infrastructure/persistence/prisma-seat-booking.adapter.ts
- [ ] T096 [P] [US3] Implementar `PrismaIdempotencyStore`: `reserve` inserta data-model.md `idempotency_keys.client_id`, `idempotency_keys.key` e `idempotency_keys.request_hash` (ante conflicto de unicidad devuelve el `idempotency_keys.booking_id` y el hash guardados) y `attach` completa `idempotency_keys.booking_id`, en backend/src/bookings/infrastructure/persistence/prisma-idempotency.store.ts
- [ ] T097 [P] [US3] Implementar `PrismaBookingStore.save`, que solo escribe tablas del módulo: data-model.md `bookings.code` (reintento si colisiona), `bookings.buyer_name`, `bookings.buyer_email` en minúsculas, `bookings.total`, `bookings.card_brand`, `bookings.card_last4`, `booking_seats.seat_id` y `booking_seats.passenger_name`, en backend/src/bookings/infrastructure/persistence/prisma-booking.store.ts
- [ ] T098 [P] [US3] Implementar `PrismaBookingLookup.findByCodeAndEmail` (normalizado; ausencia indistinguible) en backend/src/bookings/infrastructure/persistence/prisma-booking.lookup.ts
- [ ] T099 [US3] Implementar `ConfirmBookingUseCase` (parámetros: `FlightWriteContext` y `BookingPorts`) orquestando en `UnitOfWork` los pasos de research.md §9 (hash de la solicitud normalizada; repetición → `replayed`; tras el commit publica `SeatBooked` por asiento, `FlightUpdated` si quedó `SOLD_OUT` y `FlightStatsChanged`), en backend/src/bookings/application/confirm-booking.use-case.ts
- [ ] T100 [P] [US3] Implementar `LookupBookingUseCase` (misma respuesta 404 en ambos casos) en backend/src/bookings/application/lookup-booking.use-case.ts
- [ ] T101 [US3] Implementar `BookingsController` sin lógica de negocio: `POST /api/bookings` (`Idempotency-Key` obligatorio, 201 o 200 con `Idempotent-Replayed`, límite de confirmación) y `POST /api/bookings/lookup` (límite de consulta), con los esquemas de shared, según contracts/openapi.yaml, en backend/src/bookings/infrastructure/bookings.controller.ts
- [ ] T102 [US3] Crear `BookingsModule` (proveedor de `BookingPorts`) y registrarlo en backend/src/bookings/bookings.module.ts y backend/src/app.module.ts

**Checkpoint**: T083–T090 pasan; 100 % de las confirmaciones repetidas producen una sola reserva (CE-007); cobertura ≥ 80 % en bookings/domain y bookings/application. Documentación actualizada (principio IX).

---

## Fase 6: Expiración de bloqueos y RealtimeGateway (US2)

**Objetivo**: liberar y notificar los bloqueos vencidos en ~2 s y difundir por Socket.io cada
cambio tras el commit.

**Prueba independiente**: con un cliente Socket.io de prueba unido al room del vuelo se reciben
`seat:held` y `seat:released` (`EXPIRED`) con `seq` consecutivas, y el room `search` recibe
`flight:stats`.

### Pruebas (escribir primero, deben fallar) ⚠️

- [ ] T103 [P] [US2] Escribir las pruebas e2e de expiración: con `FakeClock` avanzado más allá del vencimiento, una pasada del barrido libera los asientos, emite `seat:released` con `EXPIRED` y `seq` consecutivas y actualiza las estadísticas; al arrancar la app, el barrido corre una vez y libera los vencidos (reinicio con bloqueos); con reloj real, `HOLD_TTL_SECONDS` corto y barrido de 2000 ms, el evento `EXPIRED` llega a un socket suscrito en ≤ 3 s tras el vencimiento, en backend/test/e2e/seats/hold-expiration.e2e-spec.ts
- [ ] T104 [P] [US2] Escribir las pruebas e2e del gateway: un handshake sin `clientId` v4 se rechaza con `CLIENT_ID_REQUIRED`; `flight:join` responde con ack y `seq`, y con un payload inválido `{ ok: false, code: 'VALIDATION_ERROR' }`; un evento de estado emitido por un cliente no llega a nadie; tras un bloqueo, el room recibe `seat:held` con `flightId`, `seatId`, `status`, `seq`, `occurredAt`, `holdExpiresAt` y `holderTag`, nunca el `clientId`; el room `search` recibe `flight:stats` y el room del vuelo no; ningún evento llega antes del commit; un segundo socket recibe `seat:held` en < 1 s desde la respuesta 201, en backend/test/e2e/realtime/gateway.e2e-spec.ts
- [ ] T105 [P] [US2] Escribir las pruebas unitarias de `ReleaseExpiredHoldsUseCase` con dobles (libera por vuelo; publica `SeatReleased` con `EXPIRED` tras el commit; el fallo de un vuelo no detiene a los demás) en backend/test/unit/seats/release-expired-holds.use-case.spec.ts
- [ ] T106 [P] [US2] Escribir las pruebas unitarias del mapeo de eventos de dominio a eventos de tiempo real (cada evento produce un payload válido según los esquemas de shared; ninguno contiene el `clientId`) en backend/test/unit/realtime/to-realtime-event.spec.ts

### Implementación

- [ ] T107 [US2] Implementar `PrismaSeatReleaseAdapter`: `findFlightsWithExpiredHolds(now)` y `releaseExpired(flightId, now)` (`UPDATE seats ... WHERE flight_id = :f AND status = 'HELD' AND hold_expires_at <= :now RETURNING`) en backend/src/seats/infrastructure/persistence/prisma-seat-release.adapter.ts
- [ ] T108 [US2] Implementar `ReleaseExpiredHoldsUseCase` (parámetros: `FlightWriteContext` y `SeatReleasePort`): por cada vuelo con vencidos, en `UnitOfWork`, `FlightWriteLock` (`any`) → `releaseExpired` → `FlightEventLog.append`; tras el commit publica `SeatReleased` con `EXPIRED` y `FlightStatsChanged`, en backend/src/seats/application/release-expired-holds.use-case.ts
- [ ] T109 [US2] Implementar `HoldSweeperJob` (solo dispara el caso de uso) con un intervalo de `HOLD_SWEEP_INTERVAL_MS` (por defecto 2000, vía `SchedulerRegistry`), sin solapar pasadas, y una ejecución en `onApplicationBootstrap` antes de aceptar tráfico, en backend/src/seats/infrastructure/hold-sweeper.job.ts
- [ ] T110 [P] [US2] Implementar el mapeo de eventos de dominio a payloads de `@kata/shared` (validados con sus esquemas) en backend/src/realtime/application/to-realtime-event.ts
- [ ] T111 [US2] Implementar `RealtimeGateway` sin lógica de negocio: namespace `/realtime`, middleware de handshake de la fase 3b, `flight:join` con ack `{ ok, seq }`, `flight:leave` y `search:subscribe` con payloads validados; listeners que emiten los eventos de asiento y `flight:updated` solo a `flight:{id}`, y `flight:stats` solo a `search`, según contracts/realtime-events.md, en backend/src/realtime/infrastructure/realtime.gateway.ts
- [ ] T112 [US2] Crear `RealtimeModule` (exporta `EventPublisher`), registrar el job en `SeatsModule` y ambos en `AppModule`, en backend/src/realtime/realtime.module.ts, backend/src/seats/seats.module.ts y backend/src/app.module.ts

**Checkpoint**: T103–T106 pasan; un bloqueo vencido se notifica en ≤ 5 s (CE-003), normalmente ~2 s. Documentación actualizada (principio IX).

---

## Fase 7: HU1 Búsqueda con actualización en vivo (Prioridad: P1)

**Objetivo**: buscar vuelos por ruta y fecha y ver en vivo los cambios de estado y de asientos
disponibles. Incluye la base del frontend que usan las fases 8 y 9.

**Prueba independiente**: en `/search`, BOG → MDE muestra los vuelos del día ordenados; al
cancelar uno desde la api, el resultado muestra CANCELADO sin recargar (quickstart.md § Historia 1).

### Pruebas (escribir primero) ⚠️

- [ ] T113 [P] [US1] Escribir las pruebas e2e de búsqueda: filtra por ruta y día en Bogotá; ordena por `departureAt`; incluye cancelados con su estado; `availableSeats` con vista perezosa; fecha pasada u origen = destino → `422 VALIDATION_ERROR`; sin resultados → `[]`; un retraso que cambia de día mueve el vuelo a la nueva fecha; `GET /api/flights/:id` incluye `seq` y, si no existe, → 404, en backend/test/e2e/flights/search.e2e-spec.ts
- [ ] T114 [P] [US1] Escribir las pruebas unitarias del dominio de vuelos (transiciones, `delayed`, `isBookable`, rango del día en Bogotá) en backend/test/unit/flights/flight.spec.ts y backend/test/unit/flights/bogota-day.spec.ts
- [ ] T115 [P] [US1] Escribir las pruebas unitarias de `SearchFlightsUseCase` y `GetFlightUseCase` con un `InMemoryFlightQuery` (orden, filtro por día, 404) en backend/test/doubles/flights.doubles.ts y backend/test/unit/flights/flight-queries.use-case.spec.ts

### Implementación backend

- [ ] T116 [P] [US1] Implementar la entidad `Flight` pura: `delayed` derivado de data-model.md `flights.departure_at` > `flights.scheduled_departure_at`, `isBookable(now)` según `flights.status`, `durationMinutes` desde `flights.arrival_at`, y transiciones del vuelo de data-model.md, en backend/src/flights/domain/flight.ts
- [ ] T117 [P] [US1] Implementar el rango del día en `America/Bogota` reutilizando `toBogotaDate` de shared (DRY) en backend/src/flights/domain/bogota-day.ts
- [ ] T118 [P] [US1] Definir `FlightQueryPort` (`search`, `getById` con `seq` y `availableSeats` en una sola sentencia) en backend/src/flights/application/ports/flight-query.port.ts
- [ ] T119 [US1] Implementar `PrismaFlightQueryAdapter` (`search` con el índice `(origin, destination, departure_at)` y conteo perezoso de disponibles; `getById`) en backend/src/flights/infrastructure/persistence/prisma-flight-query.adapter.ts
- [ ] T120 [P] [US1] Implementar `SearchFlightsUseCase` y `GetFlightUseCase` en backend/src/flights/application/search-flights.use-case.ts y backend/src/flights/application/get-flight.use-case.ts
- [ ] T121 [US1] Implementar `FlightsController` sin lógica de negocio con `GET /api/flights` (query validada con `createSearchFlightsQuerySchema` y el reloj) y `GET /api/flights/:id`, según contracts/openapi.yaml, en backend/src/flights/infrastructure/flights.controller.ts
- [ ] T122 [US1] Registrar `FlightsController`, `FlightQueryPort` y los casos de uso en `FlightsModule` en backend/src/flights/flights.module.ts

### Base del frontend (la usan las fases 8 y 9)

- [ ] T123 [US1] Definir la ruta lazy `/search` y la redirección de `''` a `/search`; las demás rutas se añaden en la fase donde existe su página (T150, T153, T156, T173, T174), en frontend/src/app/app.routes.ts
- [ ] T124 [P] [US1] Crear los tokens de diseño (colores con contraste ≥ 4,5:1, espaciado, tipografía, foco visible) y estilos globales mobile first en frontend/src/styles/tokens.css y frontend/src/styles.scss
- [ ] T125 [P] [US1] Implementar `ClientIdService` (UUID v4 con `crypto.randomUUID` en `localStorage` con try/catch; si el guardado no cumple `ClientIdSchema` de shared, genera uno nuevo) en frontend/src/app/core/client-id.service.ts
- [ ] T126 [P] [US1] Escribir las pruebas unitarias de los interceptores: el de identidad añade `X-Client-Id`; el de errores traduce cada `code` con el mapa único (incluido `TOO_MANY_REQUESTS` → "Demasiados intentos, espera un momento.") y muestra un toast, en frontend/src/app/core/client-id.interceptor.spec.ts y frontend/src/app/core/error.interceptor.spec.ts
- [ ] T127 [P] [US1] Implementar el interceptor que añade `X-Client-Id` en frontend/src/app/core/client-id.interceptor.ts
- [ ] T128 [P] [US1] Crear el único mapa `ErrorCode` → mensaje en español que dice qué pasó y qué hacer (RUX-035, RUX-036; DRY: ninguna otra parte de la app traduce códigos); `SEAT_UNAVAILABLE` → "Este asiento ya no está disponible. Elige otro asiento del mapa."; `TOO_MANY_REQUESTS` → "Demasiados intentos, espera un momento." en frontend/src/app/core/error-messages.ts
- [ ] T129 [US1] Implementar el interceptor de errores que traduce `code` con el mapa de T128 y muestra un toast de Angular Material en frontend/src/app/core/error.interceptor.ts
- [ ] T130 [P] [US1] Implementar el cliente REST tipado con `@kata/shared` (todas las rutas de contracts/openapi.yaml) en frontend/src/app/core/api.service.ts
- [ ] T131 [P] [US1] Escribir las pruebas unitarias de `RealtimeService` (estado de conexión, re-join tras reconexión, un Observable por evento) con un socket simulado en frontend/src/app/core/realtime.service.spec.ts
- [ ] T132 [US1] Implementar `RealtimeService`: socket tipado al namespace `/realtime` con `auth.clientId`, un Observable por evento, signal `connection` (`connected` | `reconnecting`), registro de rooms y re-join al reconectar, en frontend/src/app/core/realtime.service.ts
- [ ] T133 [P] [US1] Crear el badge de conexión "conectado" / "reconectando" (RUX-018) y el shell con header en frontend/src/app/shared/ui/connection-badge.component.ts y frontend/src/app/app.ts

### Implementación del frontend de búsqueda

- [ ] T134 [P] [US1] Escribir las pruebas del store de resultados con eventos desordenados, duplicados, con salto (dispara un único `GET /api/flights/:id` agrupado) y de vuelos no listados en frontend/src/app/features/search/search-results.store.spec.ts
- [ ] T135 [US1] Implementar el store de resultados: búsqueda REST, `search:subscribe` y, por cada vuelo listado, aplicar `flight:stats` si `seq === última + 1`, descartarlo si `seq <= última` y, ante un salto, pedir `GET /api/flights/:id` agrupando en 250 ms (contracts/realtime-events.md, regla 6); avisos de cambio (`change`) y resincronización al reconectar, en frontend/src/app/features/search/search-results.store.ts
- [ ] T136 [P] [US1] Implementar el formulario de búsqueda validado con `SearchFlightsQuerySchema` de shared (DRY): origen, destino, fecha; error junto al campo; teclado completo (RUX-021), en frontend/src/app/features/search/search-form.component.ts
- [ ] T137 [P] [US1] Implementar la lista de resultados (salida, llegada, duración, tarifa, estado con texto, disponibles, aviso de retraso con nueva hora, sin selección si CANCELADO o AGOTADO, estado vacío; RUX-022 a RUX-024) en frontend/src/app/features/search/search-results.component.ts
- [ ] T138 [US1] Implementar la página `/search` que compone formulario, resultados y store en frontend/src/app/features/search/search.page.ts

**Checkpoint**: HU1 funciona de punta a punta; un cambio de vuelo se ve en otra pestaña en < 1 s (CE-002); cobertura ≥ 80 % en flights/domain y flights/application. Documentación actualizada (principio IX).

---

## Fase 8: Frontend del mapa de asientos y checkout (US2, US3)

**Objetivo**: mapa accesible en vivo con panel de resumen y cuenta regresiva (US2); pago y
boleto (US3).

**Prueba independiente**: quickstart.md § Historia 2 e Historia 3 con dos ventanas (una en
incógnito).

### Pruebas (escribir primero) ⚠️

- [ ] T139 [P] [US2] Escribir las pruebas del reductor del mapa: aplica solo `seq === última + 1`; descarta duplicados y viejos; un hueco marca `needsResync`; un snapshot reemplaza el estado; reconoce los asientos propios por `holderTag`; `flight:updated` CANCELLED o SOLD_OUT deshabilita el mapa; los contadores derivados siempre suman el total, en frontend/src/app/core/flight-state/flight-state.reducer.spec.ts
- [ ] T140 [P] [US2] Escribir las pruebas de la cuenta regresiva (mm:ss con desfase de `serverNow`, aviso con 60 s o menos, evento al llegar a 0) en frontend/src/app/shared/ui/countdown.component.spec.ts
- [ ] T141 [P] [US2] Escribir las pruebas unitarias del componente del mapa: navegación con flechas, Enter o Espacio para bloquear o liberar, `aria-label` "Asiento 12C, pasillo, disponible", mapa deshabilitado con motivo si CANCELADO o AGOTADO, resaltado remoto sin mover el foco, en frontend/src/app/features/seat-map/seat-map.component.spec.ts
- [ ] T142 [P] [US2] Escribir las pruebas unitarias del panel de resumen: asientos, precio y total; botón de pago habilitado solo con bloqueos vigentes; aviso del último minuto; se vacía al vencer, en frontend/src/app/features/seat-map/seat-summary-panel.component.spec.ts

### Implementación del mapa (US2)

- [ ] T143 [US2] Implementar el reductor puro compartido por mapa y tablero (snapshot, eventos de asiento y de vuelo, propiedad por `holderTag`, `needsResync`, selector de contadores) según contracts/realtime-events.md § Reglas para el cliente en frontend/src/app/core/flight-state/flight-state.reducer.ts
- [ ] T144 [US2] Implementar el store del mapa: `flight:join` → snapshot → aplicar buffer con `seq` mayor; resincronizar ante hueco o reconexión con acciones deshabilitadas mientras tanto (RUX-019, RUX-020); bloqueo optimista con revert ante 409, 422 o 429; liberar; recuperar bloqueos con `GET /api/clients/me/holds`; vencimiento local que limpia el resumen (RUX-014); aviso si el vuelo se cancela con bloqueos propios, en frontend/src/app/features/seat-map/seat-map.store.ts
- [ ] T145 [P] [US2] Crear los iconos o patrones por estado (disponible, mío, de otro, reservado, no disponible; RUX-006) en frontend/src/app/shared/ui/seat-status-icon.component.ts
- [ ] T146 [P] [US2] Crear la leyenda siempre visible (RUX-008) en frontend/src/app/features/seat-map/seat-legend.component.ts
- [ ] T147 [P] [US2] Implementar la cuenta regresiva reutilizable (mm:ss, aviso con 1 minuto o menos, RUX-012 y RUX-013) en frontend/src/app/shared/ui/countdown.component.ts
- [ ] T148 [US2] Implementar el mapa con CSS Grid de botones, sin `innerHTML`: 7 columnas (A B C, pasillo, D E F); fila 1–30 numerada a ambos lados; frente del avión indicado; tipo visible; roving tabindex con flechas y Enter o Espacio; `aria-label` "Asiento 12C, pasillo, disponible"; tooltip con código, tipo, precio y estado; resaltado de ~600 ms ante cambios remotos sin mover el foco; región `aria-live`; capa deshabilitada con motivo si CANCELADO o AGOTADO (RUX-001 a RUX-010, RUX-016, RUX-017, RUX-032), en frontend/src/app/features/seat-map/seat-map.component.ts
- [ ] T149 [US2] Implementar el panel de resumen sticky (derecha en escritorio, abajo en pantallas de 640 px o menos): asientos, precio, total, cuenta regresiva y botón de pago habilitado solo con bloqueos vigentes (RUX-011 a RUX-015, RUX-033), en frontend/src/app/features/seat-map/seat-summary-panel.component.ts
- [ ] T150 [US2] Implementar la página `/flights/:id/seats` que compone mapa, leyenda, panel y store, y añadir su ruta lazy, en frontend/src/app/features/seat-map/seat-map.page.ts y frontend/src/app/app.routes.ts

### Implementación del checkout y boleto (US3)

- [ ] T151 [P] [US3] Escribir las pruebas del formulario de pago: un campo de pasajero por asiento con su código; error por campo conservando lo escrito; el botón se deshabilita mientras se procesa y se reactiva si hay rechazo; reutiliza la `Idempotency-Key` en reintentos, en frontend/src/app/features/checkout/checkout-form.component.spec.ts
- [ ] T152 [US3] Implementar el formulario de pago validado con `createCreateBookingRequestSchema` de shared (DRY; Angular Material, comprador, pasajeros por código de asiento, tarjeta con la marca detectada por `detectCardBrand`; RUX-025, RUX-027) en frontend/src/app/features/checkout/checkout-form.component.ts
- [ ] T153 [US3] Implementar la página `/checkout`: recupera bloqueos al recargar, muestra la cuenta regresiva (RUX-026), genera la `Idempotency-Key` al abrir y la renueva tras el éxito, maneja 402, 410, 422 y 429 con opción de volver al mapa y navega al boleto, y añadir su ruta lazy, en frontend/src/app/features/checkout/checkout.page.ts y frontend/src/app/app.routes.ts
- [ ] T154 [P] [US3] Implementar el boleto (código destacado, vuelo, asientos con pasajero, total, marca y últimos 4 dígitos; RUX-028) en frontend/src/app/features/booking/booking-ticket.component.ts
- [ ] T155 [P] [US3] Implementar el formulario de consulta con código y correo validado con `BookingLookupRequestSchema` de shared en frontend/src/app/features/booking/booking-lookup.component.ts
- [ ] T156 [US3] Implementar la página `/booking/:code`: usa la reserva recién creada o, si se recarga, pide el correo y consulta con `POST /api/bookings/lookup`, y añadir su ruta lazy, en frontend/src/app/features/booking/booking.page.ts y frontend/src/app/app.routes.ts

**Checkpoint**: HU2 y HU3 funcionan de punta a punta en la UI; un usuario nuevo bloquea un asiento en 3 clics o menos desde los resultados (CE-009). Documentación actualizada (principio IX).

---

## Fase 9: HU4 Tablero y admin (Prioridad: P2)

**Objetivo**: tablero de ocupación en vivo con registro de actividad, y retraso o cancelación
con clave de administrador.

**Prueba independiente**: quickstart.md § Historia 4.

### Pruebas (escribir primero, deben fallar) ⚠️

- [ ] T157 [P] [US4] Escribir las pruebas e2e de admin: sin clave y con clave incorrecta → `401 ADMIN_UNAUTHORIZED`; retraso válido → DELAYED con salida y llegada desplazadas y `flight:updated`; nueva hora no posterior → `422 INVALID_DELAY`; retrasar un vuelo SOLD_OUT conserva SOLD_OUT; cancelar con bloqueos activos libera todos, emite `seat:released` con `FLIGHT_CANCELLED` y un bloqueo posterior da `422 FLIGHT_NOT_BOOKABLE`; cancelar dos veces → `422 FLIGHT_STATUS_CONFLICT`, en backend/test/e2e/admin/update-flight-status.e2e-spec.ts
- [ ] T158 [P] [US4] Escribir las pruebas e2e del tablero: `GET /api/flights/:id/stats` suma `total` = 180 con vista perezosa y `occupancyPercent` = reservados ÷ total; `GET /api/flights/:id/events` devuelve los últimos 50, el más reciente primero, en backend/test/e2e/flights/stats-events.e2e-spec.ts
- [ ] T159 [P] [US4] Escribir las pruebas unitarias de `ChangeFlightStatusUseCase` con dobles: retraso válido; hora no posterior → `INVALID_DELAY`; SOLD_OUT conserva su estado; cancelar libera los bloqueos y publica `SeatReleased` con `FLIGHT_CANCELLED`; vuelo cancelado → `FLIGHT_STATUS_CONFLICT`; eventos solo tras el commit, en backend/test/unit/admin/change-flight-status.use-case.spec.ts
- [ ] T160 [P] [US4] Escribir las pruebas unitarias de `GetFlightStatsUseCase` y `GetFlightEventsUseCase` con dobles (porcentaje con un decimal, vuelo inexistente → 404, límite de 50) en backend/test/unit/flights/flight-stats.use-case.spec.ts

### Implementación backend

- [ ] T161 [P] [US4] Definir `FlightEventQueryPort` (`recent(flightId, limit)`, lectura separada de `FlightEventLog`) e implementarlo sobre data-model.md `flight_events.seq` y `flight_events.occurred_at`, en backend/src/shared-kernel/application/flight-event-query.port.ts y backend/src/shared-kernel/infrastructure/persistence/flight-event-query.ts
- [ ] T162 [US4] Implementar `GetFlightStatsUseCase` y `GetFlightEventsUseCase` en backend/src/flights/application/get-flight-stats.use-case.ts y backend/src/flights/application/get-flight-events.use-case.ts
- [ ] T163 [US4] Añadir `GET /api/flights/:id/stats` y `GET /api/flights/:id/events?limit=50` en backend/src/flights/infrastructure/flights.controller.ts
- [ ] T164 [P] [US4] Ampliar `FlightStatusPort` y `PrismaFlightStatusAdapter` con `delay` (data-model.md `flights.departure_at` y `flights.arrival_at` desplazados; `flights.status` DELAYED salvo SOLD_OUT) y `cancel` (`flights.status` CANCELLED); solo escribe la tabla `flights`, en backend/src/flights/application/ports/flight-status.port.ts y backend/src/flights/infrastructure/persistence/prisma-flight-status.adapter.ts
- [ ] T165 [P] [US4] Implementar `PrismaSeatReleaseAdapter.releaseAllHeld(flightId)` (`UPDATE seats ... WHERE flight_id = :f AND status = 'HELD' RETURNING`, sobre data-model.md `seats.status`, `seats.held_by` y `seats.hold_expires_at`) en backend/src/seats/infrastructure/persistence/prisma-seat-release.adapter.ts
- [ ] T166 [US4] Implementar `ChangeFlightStatusUseCase` (parámetros: `FlightWriteContext`, `FlightStatusPort` y `SeatReleasePort`, desde las API públicas de flights y seats) orquestando en `UnitOfWork`: `FlightWriteLock` (`notCancelled`), reglas de transición de `Flight`, `delay` o `cancel` y, al cancelar, `releaseAllHeld`, más `FlightEventLog.append`; tras el commit publica `FlightUpdated`, `SeatReleased` con `FLIGHT_CANCELLED` y `FlightStatsChanged`, en backend/src/admin/application/change-flight-status.use-case.ts
- [ ] T167 [US4] Implementar `AdminController` sin lógica de negocio (`PATCH /api/admin/flights/:id/status` con `AdminKeyGuard` de la fase 3b, límite de admin del throttler y body validado con `UpdateFlightStatusRequestSchema`) y `AdminModule`, y registrarlo, en backend/src/admin/infrastructure/admin.controller.ts, backend/src/admin/admin.module.ts y backend/src/app.module.ts

### Implementación frontend

- [ ] T168 [P] [US4] Escribir las pruebas del store del tablero (contadores que siempre suman el total, orden del registro, eventos duplicados y salto → nuevo snapshot) en frontend/src/app/features/dashboard/dashboard.store.spec.ts
- [ ] T169 [US4] Implementar el store del tablero con el reductor compartido de `core/flight-state`: snapshot `GET /api/flights/:id/seats` + `GET /api/flights/:id/events`, `flight:join`, aplicar solo `seq === última + 1`, descartar `seq <= última` y, ante un salto o una reconexión, volver a pedir el snapshot; contadores derivados del estado; cada evento se antepone al registro, en frontend/src/app/features/dashboard/dashboard.store.ts
- [ ] T170 [P] [US4] Crear las tarjetas de contadores en frontend/src/app/features/dashboard/stats-cards.component.ts
- [ ] T171 [P] [US4] Crear la barra de ocupación proporcional y accesible (RUX-029) en frontend/src/app/features/dashboard/occupancy-bar.component.ts
- [ ] T172 [P] [US4] Crear el registro de actividad con hora, tipo y asiento (RUX-030). El tipo se traduce desde `type` y `reason`: `SEAT_RELEASED` con `EXPIRED` → "vencimiento", con `MANUAL` → "liberación", con `FLIGHT_CANCELLED` → "liberación por cancelación"; `SEAT_HELD` → "bloqueo"; `SEAT_BOOKED` → "reserva"; `FLIGHT_UPDATED` → "cambio de estado del vuelo" en frontend/src/app/features/dashboard/activity-log.component.ts
- [ ] T173 [US4] Implementar la página `/flights/:id/dashboard` (RUX-031) y añadir su ruta lazy en frontend/src/app/features/dashboard/dashboard.page.ts y frontend/src/app/app.routes.ts
- [ ] T174 [US4] Implementar la página `/admin` (clave en `sessionStorage`, vuelo, retraso con nueva hora o cancelación, mensajes de 401, 422 y 429) y añadir su ruta lazy en frontend/src/app/features/admin/admin.page.ts y frontend/src/app/app.routes.ts

**Checkpoint**: HU4 funciona; los contadores siempre suman 180 (CE-005); cobertura ≥ 80 % en admin/application. Documentación actualizada (principio IX).

---

## Fase 10: Documentación y cierre

**Propósito**: entregables del principio IX y validación final.

- [ ] T175 [P] Completar y revisar el README (qué es, `docker compose up`, desarrollo local, scripts, pruebas, variables, tarjeta de rechazo, clave de admin de demo, estructura, sección de tiempos medidos) con el reporte de cobertura de `pnpm test:cov` (tabla por paquete y capa) y cómo correrlo, en README.md
- [ ] T176 [P] Completar y revisar la arquitectura (diagrama de módulos hexagonales con `UnitOfWork` y primitivas compartidas, flujo comando → commit → evento, estrategia de concurrencia, orden de locks, reloj compartido, idempotencia, expiración, `seq` y resincronización, `holderTag`) con las secciones "SOLID y DRY en el código" (tabla principio → ejemplo → archivo) y "Seguridad" (medida → amenaza → dónde está), en docs/architecture.md
- [ ] T177 [P] Completar el uso de IA (herramientas, flujo Spec Kit constitución → spec → clarify → plan → tasks → analyze → implement, prompts en docs/prompts/, qué se revisó y corrigió a mano) en docs/ia.md
- [ ] T178 [P] Escribir las pruebas e2e de límites por ruta: bloqueo, liberación, confirmación, consulta de boleto y admin responden `429 TOO_MANY_REQUESTS` con el formato único y `Retry-After` al superar su límite (multiplicador 1); en la consulta del boleto y en admin, rotar `X-Client-Id` no evade el límite por IP, en backend/test/e2e/security/route-rate-limits.e2e-spec.ts
- [ ] T179 [P] (Opcional) Crear la prueba de dos pestañas con Playwright (dos contextos de navegador: un bloqueo se ve en el otro en < 1 s; clic simultáneo → uno gana) en e2e/two-tabs.spec.ts y e2e/playwright.config.ts
- [ ] T180 Revisar la accesibilidad (flujo completo solo con teclado, lector de pantalla en el mapa, contraste ≥ 4,5:1, panel inferior en móvil; RUX-010, RUX-032 a RUX-034) y ajustar tokens en frontend/src/styles/tokens.css
- [ ] T181 Ejecutar `docker compose up --build` desde cero y la validación completa de quickstart.md; medir y anotar en la sección de tiempos del README la propagación entre pestañas (CE-002, CE-010), la notificación de vencimiento (CE-003) y la resincronización (CE-008); corregir desviaciones en specs/001-realtime-flight-booking/quickstart.md y README.md
- [ ] T182 Verificar las puertas de calidad de la constitución 1.1.0 (`pnpm lint`, `pnpm typecheck`, `pnpm test` con las pruebas del principio V y `pnpm test:cov` ≥ 80 %) y registrar el resultado en README.md y docs/architecture.md

---

## Dependencias y orden de ejecución

### Dependencias entre fases

```text
F1 Setup ─▶ F2 Shared ─▶ F3 Backend base ─▶ F3b Calidad y seguridad ─┬─▶ F4 HU2 bloqueos ─┬─▶ F5 HU3 reservas
                                                                     │                    └─▶ F6 Expiración + Gateway
                                                                     └─▶ F7 HU1 búsqueda (backend + base frontend)
F4 + F6 + F7 ─▶ F8 Frontend mapa (US2)
F5 + F8      ─▶ F8 Checkout (US3)
F3b + F6 + F7 ─▶ F9 HU4 tablero y admin
Todas        ─▶ F10 Documentación y cierre
```

- **F1 → F2 → F3** (hechas) **→ F3b**: secuenciales y bloqueantes. El siguiente bloque empieza
  por F3b.
- **F3b**: T050 → T051; T058 → T059; T054 → T061; T051 → T062 (ambas tocan el seed); T064 → T065
  → T066.
- **F4 (US2)**: depende de F3b; es el núcleo del reto.
- **F5 (US3)**: depende de F4 (necesita bloqueos para confirmar).
- **F6**: depende de F4; puede ir en paralelo con F5.
- **F7 (US1)**: el backend depende solo de F3b y puede ir en paralelo con F4–F6; la parte de
  frontend en vivo necesita el gateway de F6 para verse funcionando.
- **F8**: el mapa (US2) depende de F4, F6 y de la base frontend de F7; el checkout (US3)
  depende además de F5.
- **F9 (US4)**: el backend depende de F3b (guard de admin) y de F6 para difundir; el frontend,
  de la base de F7.
- **F10**: al final, aunque la documentación se actualiza en cada checkpoint (principio IX).

### Dentro de cada fase

- Las pruebas marcadas "escribir primero" se escriben y fallan antes de implementar; cada caso
  de uso tiene sus pruebas unitarias con dobles antes que él (constitución 1.1.0, principio V).
- Dominio → puertos → dobles → pruebas unitarias → adaptadores → casos de uso → controladores o
  gateway → módulo.
- Cada adaptador escribe solo las tablas de su módulo. Las operaciones entre módulos las
  orquesta un caso de uso con `UnitOfWork` (principio IV, research.md §3).
- Controladores, gateway y jobs no contienen lógica de negocio (S de SOLID).
- Los casos de uso son clases planas: no importan NestJS (ni `@Injectable()` ni `@Inject()`); cada
  módulo los registra con `useFactory` + `inject` de tokens (D de SOLID, research.md §24).
- Al cerrar cada fase, actualizar README.md, docs/architecture.md y docs/ia.md con lo que la
  fase introduce (principio IX).
- Las tareas que tocan el mismo archivo son secuenciales (por ejemplo T107 → T165 en
  `prisma-seat-release.adapter.ts`; T063 → T164 en `prisma-flight-status.adapter.ts`;
  T121 → T163 en `flights.controller.ts`; T123 → T150 → T153 → T156 → T173 → T174 en
  `app.routes.ts`; T051 → T062 en `seed.ts`; T058 → T059 por el filtro y el código de error).

### Oportunidades de paralelismo

- **F3b**: T052, T053, T055, T057 y T060 en paralelo con T050; T063 y T064 en paralelo.
- **F4**: T067–T070 en paralelo; luego T071 y las pruebas unitarias T072–T074 en paralelo.
- **F5**: T083–T088 en paralelo; los adaptadores T095–T098 en paralelo.
- **Tras F3b**: un desarrollador en F4 → F5 y otro en el backend de F7, más la base del
  frontend (T123–T133).

---

## Ejemplos de ejecución en paralelo

### Fase 3b (calidad y seguridad)

```bash
Task: "Reglas de complejidad y verificación de plantillas en eslint.config.mjs"
Task: "Scripts test:cov con umbral del 80 %"
Task: "holderTagOf en backend/src/shared-kernel/domain/holder-tag.ts"
Task: "helmet, CORS y límite de body en backend/src/app.setup.ts"
Task: "AdminKeyGuard en backend/src/admin/infrastructure/admin-key.guard.ts"
```

### Fase 4 (HU2)

```bash
# Pruebas primero, en paralelo:
Task: "Prueba de concurrencia 100 → 1 en backend/test/e2e/seats/hold-concurrency.e2e-spec.ts"
Task: "Reglas de bloqueo en backend/test/e2e/seats/hold-rules.e2e-spec.ts"
Task: "Política de bloqueo en backend/test/unit/seats/hold-policy.spec.ts"
Task: "Puertos segregados en backend/src/seats/application/ports/"

# Pruebas unitarias de casos de uso con dobles:
Task: "HoldSeatUseCase en backend/test/unit/seats/hold-seat.use-case.spec.ts"
Task: "ReleaseSeatUseCase en backend/test/unit/seats/release-seat.use-case.spec.ts"
Task: "Consultas en backend/test/unit/seats/seat-queries.use-case.spec.ts"
```

### Fase 5 (HU3)

```bash
Task: "Confirmación en backend/test/e2e/bookings/confirm-booking.e2e-spec.ts"
Task: "Idempotencia en backend/test/e2e/bookings/idempotency.e2e-spec.ts"
Task: "Consulta en backend/test/e2e/bookings/lookup.e2e-spec.ts"
Task: "Contrato de PaymentGateway en backend/test/contracts/payment-gateway.contract.ts"
Task: "Dobles de bookings en backend/test/doubles/bookings.doubles.ts"
```

### Fase 7 (HU1, base del frontend)

```bash
Task: "Tokens en frontend/src/styles/tokens.css"
Task: "ClientIdService en frontend/src/app/core/client-id.service.ts"
Task: "Pruebas de interceptores en frontend/src/app/core/*.interceptor.spec.ts"
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

1. F1 → F2 → F3 (hechas) → **F3b** (calidad y seguridad base).
2. F4 (HU2): **parar y validar** la prueba de concurrencia 100 → 1 contra PostgreSQL real. Es
   el criterio más importante de la prueba técnica.
3. F5 (HU3) y F6: el flujo de bloqueo → confirmación queda completo y notificado.
4. F7 + F8: la UI de búsqueda, mapa y pago hacen demostrable el MVP de punta a punta.

### Entrega incremental

1. Base lista (F1–F3) → `docker compose up` sano con datos de prueba.
2. \+ F3b → lint con complejidad, cobertura medida y seguridad base verificadas.
3. \+ F4 → bloqueos correctos por API (demostrable con curl).
4. \+ F5 + F6 → reservas e idempotencia; eventos en vivo.
5. \+ F7 → búsqueda en vivo en la UI.
6. \+ F8 → mapa, pago y boleto en la UI (MVP completo).
7. \+ F9 → tablero y admin.
8. \+ F10 → documentación y validación final.

### Si el tiempo se acaba (prototipo de 1 día)

Recortar en este orden, sin tocar las pruebas exigidas por el principio V (críticas, unitarias
de casos de uso, reductor, `RealtimeService`, interceptores, mapa y panel): T179 (Playwright
opcional), T168 y T134 (pruebas de stores secundarios), detalles visuales de T170–T172.

---

## Notas

- [P] = archivos distintos y sin dependencias pendientes.
- La etiqueta [USn] traza cada tarea a su historia de [spec.md](./spec.md).
- Verificar que las pruebas fallan antes de implementar.
- Hacer commit con Conventional Commits tras cada tarea o grupo lógico.
- Actualizar README.md y docs/architecture.md en el mismo cambio si cambia el diseño
  (principio IX).
