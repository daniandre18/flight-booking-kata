# Plan de implementación: Reservas de vuelos en tiempo real

**Rama**: `001-realtime-flight-booking` | **Fecha**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificación de `/specs/001-realtime-flight-booking/spec.md`. Contexto técnico:
[docs/prompts/plan.md](../../docs/prompts/plan.md), con todas sus decisiones aplicadas.

## Resumen

Prototipo de reservas de vuelos en tiempo real: búsqueda de vuelos, mapa de asientos en vivo,
bloqueo temporal con reloj compartido por cliente, confirmación con pago ficticio e idempotente,
y tablero de ocupación con acciones de administrador protegidas por clave.

Enfoque técnico: monorepo pnpm con backend NestJS (monolito modular hexagonal), frontend
Angular y contratos compartidos en `@kata/shared` (zod). PostgreSQL decide cada transición de
asiento con un único `UPDATE` condicional. Cada operación bloquea primero la fila del vuelo,
que asigna una secuencia ordenada a los eventos. Los eventos se publican por Socket.io solo
después del commit. El frontend aplica eventos por secuencia y se resincroniza con un snapshot
ante huecos o reconexiones. Detalle en [research.md](./research.md).

## Contexto técnico

**Lenguaje y versión**: TypeScript en modo `strict` en los tres paquetes; Node.js LTS vigente
(fijado en `.nvmrc` y en las imágenes Docker).

**Dependencias principales**:
- Backend: NestJS, Prisma, nestjs-zod, `@nestjs/schedule`, `@nestjs/event-emitter`
  (EventEmitter2), `@nestjs/websockets` con Socket.io, nestjs-pino, helmet y
  `@nestjs/throttler`.
- Frontend: Angular en su versión estable vigente (standalone, signals, RxJS),
  `socket.io-client` y Angular Material (solo formularios, diálogos y toasts).
- Compartido: zod.

**Almacenamiento**: PostgreSQL 16. Tablas `airports`, `flights`, `seats`, `bookings`,
`booking_seats`, `idempotency_keys` y `flight_events` ([data-model.md](./data-model.md)).

**Pruebas**:
- Backend: Jest para dominio y casos de uso (unitarias con dobles de los puertos en
  `backend/test/doubles/` y pruebas de contrato en `backend/test/contracts/`); Jest + Supertest
  para e2e contra PostgreSQL real (Testcontainers, o `TEST_DATABASE_URL`).
- Cobertura: `pnpm test:cov` con umbral del 80 % de líneas y ramas en `backend/src/**/domain`,
  `backend/src/**/application` y `shared/`.
- Frontend: runner por defecto del Angular CLI (Vitest).
- Opcional: Playwright.

**Plataforma objetivo**: contenedores Linux con `docker compose`; navegadores modernos de
escritorio y móvil.

**Tipo de proyecto**: aplicación web (api + spa) en monorepo con paquete de contratos
compartido.

**Objetivos de rendimiento**:
- Un cambio se ve en otra pestaña en menos de 1 s (CE-002, CE-010).
- Liberación y notificación de bloqueos vencidos en 5 s o menos (CE-003); el job de
  expiración corre cada 2000 ms (`HOLD_SWEEP_INTERVAL_MS`, configurable), así que el peor caso
  ronda los 2 s (research §11).
- 100 bloqueos simultáneos sobre un asiento: 1 éxito y 99 conflictos (CE-001).
- Resincronización tras reconectar en menos de 3 s (CE-008).

**Restricciones**:
- Prototipo de 1 día.
- Sin autenticación real ni pagos reales.
- Un solo comando para levantar todo.
- Accesibilidad: teclado completo, lector de pantalla y contraste de 4,5:1.

**Escala y alcance**:
- 5 aeropuertos, 20 rutas, 420 vuelos (7 días × 3 diarios por ruta) y 75.600 asientos.
- Decenas de usuarios simultáneos en la demo.
- 6 pantallas: búsqueda, mapa, pago, boleto, tablero y admin.

## Verificación de la constitución

*PUERTA: debe pasar antes de la Fase 0 y se vuelve a revisar tras la Fase 1. Verificada contra la
constitución 1.1.0.*

| Principio | Estado | Cómo se cumple |
|-----------|--------|----------------|
| I. Integridad de reservas | ✅ con excepción justificada | Toda transición de asiento es un `UPDATE` condicional cuyo conteo decide (research §5, §8, §9). `UNIQUE(seat_id)` en `booking_seats` es la última defensa. El cliente pinta lo que confirma el servidor. **Excepción**: el límite de 4 y el reloj compartido leen los bloqueos del propio cliente antes del `UPDATE` (ver Seguimiento de complejidad) |
| II. Comandos HTTP, eventos WebSocket | ✅ | Comandos REST con códigos claros. El socket no acepta comandos. Los eventos se publican tras el commit con `flightId`, `seatId`, estado, `seq` por vuelo y `occurredAt`. En el room del vuelo cada evento tiene una `seq` consecutiva, sin `flight:stats`. Todos los clientes descartan `seq` ≤ última y, ante un salto, vuelven a pedir el estado por HTTP: el mapa y el tablero el snapshot, la búsqueda `GET /api/flights/:id` (research §13, [realtime-events.md](./contracts/realtime-events.md)) |
| III. Contratos compartidos y DRY | ✅ | DTOs, enums, esquemas zod, códigos de error y eventos solo en `@kata/shared`. El backend valida con ellos (nestjs-zod) y el frontend usa los mismos esquemas en sus formularios. Una sola definición por cosa: `ApiExceptionFilter` (backend), `error-messages.ts` (frontend), `ClientIdSchema`, `holderTagOf`, `detectCardBrand` (research §24) |
| IV. Hexagonal modular y SOLID | ✅ | `domain/` y `application/` sin NestJS, Prisma ni Socket.io. **S**: un caso de uso por clase (`HoldSeatUseCase`, `ConfirmBookingUseCase`, `ChangeFlightStatusUseCase`…), controladores y gateway sin lógica. **O**: variantes por adaptadores (`PaymentGateway`, `Clock`, `EventPublisher`). **L**: pruebas de contrato compartidas. **I**: puertos segregados (`SeatHoldsPort`, `SeatQueryPort`, `SeatBookingPort`, `SeatReleasePort`, `FlightStatusPort`, `FlightQueryPort`…). **D**: casos de uso como clases planas (sin decoradores de Nest) que los módulos registran con `useFactory` + `inject` de tokens, y objetos de dependencias (`FlightWriteContext`, `BookingPorts`) para respetar `max-params` ≤ 4 (research §24). Cada módulo escribe solo sus tablas. Las operaciones entre módulos (confirmar, cancelar) las orquesta un caso de uso con `UnitOfWork` sobre los puertos de cada módulo. Las primitivas compartidas (lock del vuelo, escritor de eventos, estadísticas) viven en `shared-kernel/infrastructure/persistence/`. Módulos `flights`, `seats`, `bookings`, `realtime`, más `admin` y `health` (research §3) |
| V. Pruebas primero y cobertura medida | ✅ | Concurrencia (100 → 1), expiración, confirmación con bloqueo vencido, idempotencia y cancelación con bloqueos: e2e contra PostgreSQL real. Pruebas unitarias de cada caso de uso escritas antes que él, con dobles de los puertos; cobertura ≥ 80 % (líneas y ramas) en domain/, application/ y shared/ con `pnpm test:cov`; pruebas unitarias del frontend (reductor, `RealtimeService`, interceptores, mapa y panel). Reloj inyectado (`FakeClock`) y `:now` como parámetro en SQL |
| VI. Errores explícitos | ✅ | Formato único `{ code, message, details }` con 400/401/402/404/409/410/422/429, sin stack ni detalles internos: 401 `ADMIN_UNAUTHORIZED` para la clave de administrador; 409 solo para conflictos de asiento (`SEAT_UNAVAILABLE`, `SEAT_NOT_HELD`); 422 para reglas de negocio (`HOLD_LIMIT_REACHED`, `IDEMPOTENCY_KEY_REUSED`, `FLIGHT_NOT_BOOKABLE`, `FLIGHT_STATUS_CONFLICT`, etc.). El frontend traduce cada `code` al español y revierte la UI optimista |
| VII. Simplicidad | ✅ | Monolito modular, identidad anónima por `clientId`, pago ficticio y `docker compose up`. Sin colas, caché ni servicios extra |
| VIII. Calidad | ✅ | `strict` (verificado con `pnpm typecheck`), ESLint + Prettier sin `any` ni `console.log`, con `complexity` ≤ 10, `max-lines-per-function` ≤ 40 y `max-params` ≤ 4; identificadores en inglés; logs JSON con pino y `holderTag` como contexto (nunca el `clientId`); puerta de calidad con cobertura; `GET /health` (fuera del prefijo `/api`) con verificación de la base, seed determinista y Conventional Commits |
| IX. Documentación | ✅ | `README.md`, `docs/architecture.md` y `docs/ia.md` se crean como esqueleto en la fase 1 de tareas. Cada fase los actualiza en su checkpoint con el diseño que introduce, y la fase 10 los completa y revisa, con las secciones "SOLID y DRY en el código", "Seguridad" y el reporte de cobertura |
| X. Seguridad y validaciones | ✅ | Validación zod de toda entrada (body, query, params, headers y payloads de socket) con los esquemas de `@kata/shared`; `X-Client-Id` UUID v4. helmet, CORS restringido a `CORS_ORIGINS` y body ≤ 16 kb. `@nestjs/throttler` por cliente o IP en bloqueo, liberación, confirmación, consulta de boleto y admin → `429 TOO_MANY_REQUESTS`. `ADMIN_KEY` con `timingSafeEqual`. Secretos solo por entorno. De la tarjeta solo se guardan marca y últimos 4. pino con redact de `X-Admin-Key`, `X-Client-Id` y datos de pago. SQL solo con tagged templates de Prisma. Handshake del socket validado y sin eventos de estado desde clientes. Frontend sin `innerHTML` ni `bypassSecurityTrust*` (ESLint + verificación de plantillas). Errores sin stack. Detalle: research §25; tareas en la fase 3b |

**Resultado de la puerta (antes de la Fase 0)**: PASA. Queda una desviación justificada
(principio I), registrada abajo. El 401 dejó de ser desviación con la enmienda 1.0.1 de la
constitución.

**Revisión tras la Fase 1**: PASA. El diseño final mantiene esa desviación y añade tres
refinamientos que refuerzan los principios I, II y VI sin crear desviaciones nuevas:

- **Lock de la fila del vuelo con orden fijo de locks** (research §6): cierra la carrera entre
  cancelación y bloqueo y garantiza que `seq` sigue el orden de commit.
- **`holderTag`** en lugar de difundir el `clientId` (research §15).
- **`flight_events`** para el registro de actividad (research §13).

**Revisión tras `/speckit-analyze` (2026-11-18)**: PASA. Los hallazgos críticos y altos se
resolvieron en el diseño, sin cambiar la constitución:

- **IV**: `UnitOfWork` y primitivas en `shared-kernel`; ningún módulo importa la
  infraestructura de otro.
- **II**: el room del vuelo no lleva `flight:stats`; la búsqueda vuelve a pedir el vuelo ante
  un salto.
- **VI**: los conflictos de estado del vuelo responden 422.
- **VIII**: `GET /health`.
- **IX**: esqueletos de documentación desde la fase 1.

También se dimensionaron las transacciones de Prisma, el snapshot se lee en `REPEATABLE READ`,
`flight_events.seat_code` pasó a `varchar(3)` y se citaron los campos que faltaban.

**Revisión con la constitución 1.1.0 (2026-11-18)**: PASA. El diseño incorpora los criterios
de evaluación (docs/prompts/criterios-evaluacion.md) sin desviaciones nuevas:

- **IV (SOLID)**: puertos segregados, casos de uso con sufijo `UseCase` y objetos de
  dependencias (research §24).
- **V**: pruebas unitarias con dobles antes de cada caso de uso, contratos compartidos y
  cobertura medida.
- **X**: medidas de seguridad de research §25, implementadas en la fase 3b antes de las
  historias.
- El código del bloque 1 que no cumplía 1.1.0 (reglas de complejidad, `test:cov`, UUID v4,
  `clientId` en logs, endurecimiento HTTP, marca de tarjeta, puerto `FlightRepository`) se
  corrige en la fase 3b.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/001-realtime-flight-booking/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones y alternativas
├── data-model.md        # Fase 1: tablas, máquina de estados, invariantes
├── quickstart.md        # Fase 1: ejecución y validación
├── contracts/
│   ├── openapi.yaml           # REST bajo /api
│   └── realtime-events.md     # Catálogo de eventos Socket.io
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Código fuente (raíz del repositorio)

```text
package.json                 # scripts: dev, test, test:cov, lint, typecheck, build, seed
scripts/check-templates.mjs  # falla si una plantilla usa [innerHTML] o bypassSecurityTrust
pnpm-workspace.yaml
docker-compose.yml           # postgres:16, api, web
.env.example
.nvmrc
eslint.config.mjs
.prettierrc
README.md
docs/
├── architecture.md
├── ia.md
└── prompts/plan.md

shared/                      # @kata/shared
└── src/
    ├── enums/               # SeatStatus, FlightStatus, SeatType, ReleaseReason
    ├── schemas/             # esquemas zod + tipos inferidos (DTOs y requests)
    ├── errors/              # ErrorCode, ErrorResponse
    ├── realtime/            # ServerToClientEvents, ClientToServerEvents, RealtimeEvents
    ├── domain/              # utilidades de código de asiento
    └── index.ts
└── test/                    # pruebas de esquemas

backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docker/entrypoint.sh
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── shared-kernel/
│   │   ├── domain/          # Clock, DomainError, holderTagOf
│   │   ├── application/     # puertos EventPublisher, UnitOfWork, FlightWriteLock, FlightEventLog,
│   │   │                    # FlightEventQueryPort, FlightStatsReader y el objeto FlightWriteContext
│   │   └── infrastructure/
│   │       ├── http/        # filtro de errores, zod, @ClientId(), rate-limits (throttler)
│   │       ├── persistence/ # PrismaService, PrismaUnitOfWork (AsyncLocalStorage), flight-write-lock, flight-events.writer, flight-stats.query
│   │       └── ...          # logger, config, SystemClock
│   ├── flights/
│   │   ├── domain/          # Flight, reglas de transición, retraso
│   │   ├── application/     # SearchFlightsUseCase, GetFlightUseCase, GetFlightStatsUseCase,
│   │   │                    # GetFlightEventsUseCase; puertos FlightQueryPort y FlightStatusPort
│   │   └── infrastructure/  # PrismaFlightQueryAdapter, PrismaFlightStatusAdapter (solo tabla flights), FlightsController
│   ├── seats/
│   │   ├── domain/          # reglas de bloqueo: límite, reloj compartido, vista perezosa
│   │   ├── application/     # HoldSeatUseCase, ReleaseSeatUseCase, GetSeatMapUseCase, GetMyHoldsUseCase,
│   │   │                    # ReleaseExpiredHoldsUseCase; puertos SeatHoldsPort, SeatQueryPort,
│   │   │                    # SeatBookingPort, SeatReleasePort
│   │   └── infrastructure/  # persistence/ (un adaptador Prisma por puerto, solo tabla seats),
│   │                        # SeatsController, HoldSweeperJob
│   ├── bookings/
│   │   ├── domain/          # código de reserva
│   │   ├── application/     # ConfirmBookingUseCase, LookupBookingUseCase; puertos PaymentGateway,
│   │   │                    # BookingStore, BookingLookupPort, IdempotencyStore y objeto BookingPorts
│   │   └── infrastructure/  # persistence/ (PrismaBookingStore, PrismaBookingLookup,
│   │                        # PrismaIdempotencyStore), FakePaymentGateway, BookingsController
│   ├── realtime/
│   │   ├── application/     # mapeo de eventos de dominio a eventos de shared
│   │   └── infrastructure/  # RealtimeGateway (namespace /realtime), socket-handshake, EventEmitterPublisher
│   ├── admin/
│   │   ├── application/     # ChangeFlightStatusUseCase (FlightStatusPort + SeatReleasePort)
│   │   └── infrastructure/  # AdminController, AdminKeyGuard
│   └── health/
│       └── infrastructure/  # HealthController
└── test/
    ├── support/             # FakeClock
    ├── doubles/             # dobles en memoria de los puertos (repositorios, pago, publicador, UnitOfWork)
    ├── contracts/           # pruebas de contrato compartidas (L de SOLID)
    ├── unit/                # dominio y casos de uso con dobles; cobertura ≥ 80 %
    └── e2e/                 # Supertest + PostgreSQL real (concurrencia, expiración, etc.)

frontend/
├── proxy.conf.json          # desarrollo: :4200 → :3000 (/api, /health, /socket.io con ws)
└── src/app/
    ├── core/                # ClientIdService, interceptores (client-id, errores), RealtimeService, ErrorMessages
    │   └── flight-state/    # reductor compartido por mapa y tablero (contadores derivados)
    ├── features/
    │   ├── search/          # formulario y resultados en vivo
    │   ├── seat-map/        # mapa (grid accesible), leyenda, panel de resumen, store
    │   ├── checkout/        # formulario de pago con cuenta regresiva
    │   ├── booking/         # boleto y consulta por código + correo
    │   ├── dashboard/       # contadores, barra de ocupación, registro de actividad
    │   └── admin/           # retraso y cancelación con clave
    ├── shared/ui/           # badge de conexión, cuenta regresiva, iconos de estado
    └── styles/tokens.css    # tokens de diseño en variables CSS

e2e/                         # (opcional) Playwright: prueba de dos pestañas
```

**Decisión de estructura**: aplicación web en monorepo pnpm con tres paquetes (`shared/`,
`backend/` y `frontend/`), como exige la constitución. El backend se organiza por módulo de
negocio con capas hexagonales internas y el frontend por funcionalidad.

## Seguimiento de complejidad

| Desviación | Por qué se necesita | Alternativa más simple descartada porque |
|------------|---------------------|------------------------------------------|
| Lectura de los bloqueos del propio cliente antes del `UPDATE` condicional (límite de 4 y vencimiento compartido), bajo `pg_advisory_xact_lock(clientId, flightId)` (principio I) | La spec exige un máximo de 4 bloqueos y un reloj compartido (Clarifications); ambos dependen de los bloqueos existentes del cliente. La lectura no decide la propiedad del asiento: eso lo sigue decidiendo el `UPDATE` condicional, y el advisory lock serializa al mismo cliente en el mismo vuelo | Una restricción declarativa no puede expresar "máximo 4 filas vigentes por cliente y vuelo" con vencimiento por tiempo; un trigger esconde la regla fuera del dominio y es más difícil de probar |
| Los archivos de prueba (`*.spec.ts`, `*.e2e-spec.ts`, `test/**`) quedan exentos de `max-lines-per-function` ≤ 40 (principio VIII); `complexity` y `max-params` sí se aplican | En Jest y Vitest, el callback de `describe` agrupa todos los casos de una unidad y supera las 40 líneas aunque cada `it` sea corto. La regla mide funciones de producción, que es lo que el principio quiere acotar | Partir cada `describe` en varios (dispersa los casos de una misma unidad y empeora la lectura); subir el límite global (relaja la regla también para el código de producción) |

## Riesgos y puntos abiertos

1. **Pool y transacciones de Prisma**: la prueba de concurrencia depende de
   `maxWait`/`timeout` de 10 s y un pool de 20 conexiones (`DB_POOL_MAX`, research §4). Si cambia la estrategia
   de lock, hay que revisar estos valores.
2. **Evento perdido entre commit y publicación** (caída del proceso en ese instante): no hay
   outbox. Los clientes lo corrigen con el snapshot al detectar el hueco de `seq` o al
   reconectar (research §13).

## Fase 2 (fuera de este comando)

`/speckit-tasks` generará `tasks.md` por historia de usuario. Orden sugerido:

1. Base del monorepo y `@kata/shared`.
2. Esquema, migraciones y seed.
3. Calidad y seguridad base (fase 3b, constitución 1.1.0): complejidad, cobertura, principio X,
   puertos segregados y dobles de prueba.
4. Pruebas e2e críticas y unitarias de casos de uso (en rojo).
5. Bloqueo y liberación (Historia 2).
6. Confirmación (Historia 3).
7. Búsqueda en vivo (Historia 1).
8. Tablero y admin (Historia 4).
9. Accesibilidad y documentación.
