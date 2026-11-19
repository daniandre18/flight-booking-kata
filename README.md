# Flight Booking Realtime

Prototipo de reservas de vuelos en tiempo real para la prueba técnica Full Stack Senior:

- búsqueda de vuelos por ruta y fecha, con cambios en vivo;
- mapa de asientos en vivo, con bloqueo temporal y un reloj compartido por cliente;
- confirmación con pago ficticio e idempotente, y consulta del boleto con código y correo;
- tablero de ocupación en vivo, y retraso o cancelación de vuelos con clave de administrador.

Ningún asiento puede quedar bloqueado ni reservado por dos clientes a la vez. Lo decide
PostgreSQL con un único `UPDATE` condicional por transición, y los cambios se difunden por
Socket.io solo después del commit.

> **Estado**: las 10 fases de [tasks.md](specs/001-realtime-flight-booking/tasks.md) están
> implementadas (182 de 182 tareas, incluida la prueba opcional de dos pestañas, T179). Ver
> [Limitaciones conocidas](#limitaciones-conocidas).

## Stack

| Paquete                    | Tecnología                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- |
| `shared/` (`@kata/shared`) | TypeScript 6, zod 4: enums, esquemas, errores y eventos (contratos únicos)      |
| `backend/`                 | NestJS 11, Prisma 7 (adaptador `pg`), PostgreSQL 16, Socket.io, pino, helmet    |
| `frontend/`                | Angular 22 (standalone, signals, zoneless), socket.io-client, Material (toasts) |

Monorepo con pnpm workspaces. Node.js 24 LTS (`.nvmrc`) y pnpm 10 (`packageManager`).

## Arquitectura en breve

Es un **monolito modular con arquitectura hexagonal** (NestJS), una SPA Angular y un paquete de
contratos compartidos. Los **comandos** van por REST y los **cambios** se difunden por Socket.io
solo después del commit. PostgreSQL decide cada transición de asiento con un único `UPDATE`
condicional, así que nunca hay doble reserva.

```mermaid
flowchart LR
  UI["Angular SPA<br/>(mapa, búsqueda, pago, tablero, admin)"]
  NGINX["nginx<br/>SPA + proxy"]
  API["NestJS<br/>módulos flights · seats · bookings · admin · realtime"]
  DB[("PostgreSQL 16<br/>UPDATE condicional + flight_events")]
  SH["@kata/shared<br/>zod, tipos, errores, eventos"]

  UI -- "REST /api (bloquear, liberar, pagar, admin)" --> NGINX --> API --> DB
  API -- "Socket.io /realtime: seat:* y flight:* con seq, tras el commit" --> NGINX --> UI
  SH -. "mismos contratos" .- UI
  SH -. "mismos contratos" .- API
```

- **Concurrencia**: lock de la fila del vuelo, luego advisory lock del cliente, luego un
  `UPDATE seats ... WHERE disponible` cuyo conteo decide quién gana (1 × 201, 99 × 409).
- **Tiempo real**: cada evento lleva una `seq` por vuelo. El cliente descarta duplicados y,
  ante un hueco o una reconexión, pide de nuevo el snapshot por HTTP.
- **Bloqueo temporal**: 10 minutos, con un reloj compartido por cliente y vuelo. Un barrido
  cada 2 s libera los vencidos y los notifica.

Detalle, justificación y decisiones técnicas en [docs/architecture.md](docs/architecture.md).

## Levantar todo (un comando)

```bash
docker compose up --build
```

| Qué    | URL                                                               |
| ------ | ----------------------------------------------------------------- |
| Web    | <http://localhost:8080>                                           |
| API    | <http://localhost:8080/api> (nginx) o <http://localhost:3000/api> |
| Health | <http://localhost:8080/health> → `{"status":"ok","db":"up"}`      |

Al arrancar, la api aplica las migraciones, carga el seed si la base está vacía, hace una
pasada del barrido de bloqueos vencidos y empieza a escuchar. Desde cero (imágenes y volumen
nuevos), el build y el arranque tardaron **33 s** y **29 s** en dos corridas, y `/health` respondió
entre **3 y 6 s** después
(medido el 2026-11-19).

## Desarrollo local

```bash
cp .env.example .env
pnpm install
docker compose up -d db
pnpm --filter backend migrate   # migraciones
pnpm seed                       # datos de prueba (borra y regenera, determinista)
pnpm dev                        # api en :3000 y web en :4200 (proxy de /api, /health y /socket.io)
```

## Cómo usarlo (demo)

1. En **Buscar vuelos**, busca BOG → MDE para mañana y elige **Elegir asientos**.
2. Bloquea hasta 4 asientos con clic, o con el teclado (flechas, y luego Enter o Espacio). La
   cuenta regresiva es una sola para todos tus asientos del vuelo.
3. Para tener un segundo cliente, abre el mismo vuelo en una ventana de incógnito: cada ventana
   genera su propio `clientId`.
4. Ve a **Continuar al pago**. Usa `4111 1111 1111 1111` (aprobada) o
   `4000 0000 0000 0002` (siempre rechazada), con un vencimiento futuro (`12/30`) y CVV `123`.
5. Para consultar el boleto, ve a **Consultar boleto** e ingresa el código y el correo.
6. Para ver el tablero, entra a **Ver ocupación** en un resultado (`/flights/<id>/dashboard`).
7. En **Administración** (`/admin`), retrasa o cancela un vuelo. La clave de la demo es
   `demo-admin-key` (variable `ADMIN_KEY`).

El seed crea 9 aeropuertos, 72 rutas, 3.024 vuelos (3 diarios durante 14 días) y 544.320 asientos.
También crea un vuelo BOG → MDE de mañana con un solo asiento libre (30F) para probar AGOTADO,
y 45 reservas reales. El log del seed imprime ese vuelo y una reserva de ejemplo con su correo.

## Scripts

| Script              | Qué hace                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | api y web en modo desarrollo                                                                                                          |
| `pnpm build`        | compila los tres paquetes                                                                                                             |
| `pnpm typecheck`    | `tsc --noEmit` en los tres paquetes (modo `strict`)                                                                                   |
| `pnpm lint`         | ESLint (sin `any` ni `console.log`, complejidad ≤ 10, funciones ≤ 40 líneas, ≤ 4 parámetros) y revisión de plantillas sin `innerHTML` |
| `pnpm test`         | shared, backend (unitarias y e2e contra PostgreSQL real) y frontend (Vitest)                                                          |
| `pnpm test:cov`     | cobertura de shared, backend y frontend; falla si baja del 80 % en `shared/` o en `backend/src/**/{domain,application}`               |
| `pnpm seed`         | regenera los datos de prueba                                                                                                          |
| `pnpm test:e2e:ui`  | Playwright con tu Chrome: dos pestañas reales contra el stack levantado (`docker compose up`; `BASE_URL` para otro destino)           |
| `pnpm format:check` | Prettier en modo verificación                                                                                                         |

Las pruebas e2e levantan PostgreSQL 16 con Testcontainers. Para usar una base que ya existe:
`TEST_DATABASE_URL=postgresql://... pnpm --filter backend test:e2e`.

## Pruebas

Resultado de `pnpm test` del 2026-11-19 (corrida final, tras formatear): **356 pruebas, todas en verde**.

| Paquete                                                                           | Suites | Pruebas |
| --------------------------------------------------------------------------------- | -----: | ------: |
| shared (esquemas, marca de tarjeta, eventos)                                      |      4 |      50 |
| backend: unitarias (dominio, casos de uso con dobles, contratos)                  |     27 |     163 |
| backend: e2e (Supertest + Socket.io contra PostgreSQL 16 real)                    |     15 |      80 |
| frontend (Vitest: reductor, RealtimeService, interceptores, stores y componentes) |     11 |      63 |

Aparte, `pnpm test:e2e:ui` corre 2 pruebas de Playwright en el Chrome instalado contra el stack
de `docker compose`, con dos contextos de navegador (dos `clientId` distintos):

- un bloqueo en una pestaña se ve en la otra en menos de 1 s;
- dos clics simultáneos sobre el mismo asiento: gana exactamente una pestaña.

Pasaron 10 de 10 veces.

Pruebas obligatorias del principio V, todas e2e contra PostgreSQL real:

| Prueba                                          | Archivo                                  | Resultado                                                                                 |
| ----------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| 100 bloqueos simultáneos del mismo asiento      | `seats/hold-concurrency.e2e-spec.ts`     | 1 × 201, 99 × 409, 0 × 5xx                                                                |
| Expiración (reloj falso, reinicio y reloj real) | `seats/hold-expiration.e2e-spec.ts`      | `seat:released` `EXPIRED` con `seq` consecutivas                                          |
| Confirmar con bloqueo vencido                   | `bookings/confirm-booking.e2e-spec.ts`   | `410 HOLD_EXPIRED`, sin reserva                                                           |
| Idempotencia (secuencial y concurrente)         | `bookings/idempotency.e2e-spec.ts`       | 201 y luego 200 con el mismo código; una sola reserva                                     |
| Cancelación con bloqueos activos                | `admin/update-flight-status.e2e-spec.ts` | bloqueos liberados, `seat:released` `FLIGHT_CANCELLED`, después `422 FLIGHT_NOT_BOOKABLE` |

### Prueba de concurrencia (resultados reales)

Hay 100 clientes distintos que hacen `POST /api/flights/:id/seats/12C/hold` al mismo tiempo
contra PostgreSQL 16, con un pool de 20 conexiones. Se ejecutó 3 veces seguidas, y otras 2 dentro
de las corridas completas de `pnpm test`:

| Ejecución | 201 | 409 `SEAT_UNAVAILABLE` | 5xx | Duración |
| --------: | --: | ---------------------: | --: | -------: |
|         1 |   1 |                     99 |   0 |   170 ms |
|         2 |   1 |                     99 |   0 |   164 ms |
|         3 |   1 |                     99 |   0 |   160 ms |
|         4 |   1 |                     99 |   0 |   156 ms |
|         5 |   1 |                     99 |   0 |   142 ms |

En la base queda un solo asiento `HELD`, a nombre del ganador, y un solo evento en
`flight_events`. Para repetirla: `pnpm --filter backend test:e2e -- hold-concurrency`.

## Cobertura

`pnpm test:cov` del 2026-11-19. La constitución exige al menos el 80 % de líneas y de ramas
en `shared/` y en el dominio y los casos de uso del backend; el script falla si no se cumple.

| Paquete / capa                                    | Líneas |  Ramas | Funciones |
| ------------------------------------------------- | -----: | -----: | --------: |
| **shared** (total)                                |  100 % | 95,2 % |    92,0 % |
| **backend** dominio + aplicación (total)          | 99,8 % | 96,5 % |    99,1 % |
| backend `admin/application`                       |  100 % |  100 % |     100 % |
| backend `bookings/application`                    |  100 % |  100 % |     100 % |
| backend `bookings/domain`                         |  100 % |  100 % |     100 % |
| backend `flights/application`                     | 98,0 % | 92,3 % |    93,8 % |
| backend `flights/domain`                          |  100 % |  100 % |     100 % |
| backend `realtime/application`                    |  100 % |  100 % |     100 % |
| backend `seats/application`                       |  100 % | 91,7 % |     100 % |
| backend `seats/domain`                            |  100 % |  100 % |     100 % |
| backend `shared-kernel/application`               |  100 % | 83,3 % |     100 % |
| backend `shared-kernel/domain`                    |  100 % |  100 % |     100 % |
| **frontend** (archivos cubiertos por las pruebas) | 91,4 % | 85,7 % |    81,8 % |

La infraestructura del backend (Prisma, HTTP, gateway) no entra en este umbral: la cubren las
80 pruebas e2e contra la base real. El umbral se mide sobre el total de cada paquete, y además
todas las capas del backend superan el 80 % de líneas y ramas.

## Tiempos medidos

Medidos el 2026-11-19 en un equipo de desarrollo local (macOS, Docker Desktop), contra el stack
de `docker compose` y a través de nginx (`:8080`). Los clientes son de Socket.io
(`socket.io-client` 4.8) en la misma máquina, así que no incluyen latencia de red real ni el
tiempo de pintado del navegador. Sirven para ubicar al servidor frente a las metas.

| Criterio        | Qué se mide                                                                                                        |   n |    p50 |     p95 |  Máximo | Meta  |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | --: | -----: | ------: | ------: | ----- |
| CE-002 / CE-010 | `POST /hold` → `seat:held` en otro cliente                                                                         |  20 | 3,7 ms | 13,9 ms | 21,7 ms | < 1 s |
| CE-002 / CE-010 | clic en una pestaña de Chrome → asiento "bloqueado por otra persona" en la otra (Playwright, desde la 2.ª corrida) |  10 |  49 ms |   51 ms |   51 ms | < 1 s |
| CE-002          | `PATCH` retraso (admin) → `flight:stats` en el room `search`                                                       |  10 | 3,5 ms |  7,5 ms |  7,5 ms | < 1 s |
| CE-003          | vencimiento del bloqueo → `seat:released` `EXPIRED` (`HOLD_TTL_SECONDS=5`, barrido cada 2000 ms)                   |   5 |  1,0 s |   2,0 s |   2,0 s | ≤ 5 s |
| CE-008          | reconexión del socket → re-join + snapshot que ya trae el cambio perdido                                           |  10 | 4,8 ms | 11,8 ms | 11,8 ms | < 3 s |

- Para repetirlas: `node scripts/measure-realtime.mjs <flightId>`. Para CE-003 se levanta la
  api con `HOLD_TTL_SECONDS=5` y se agrega `expiry`. Una segunda corrida, con el código ya
  formateado, dio p50 de 3,8 ms, 2,9 ms y 4,6 ms en las filas de propagación, retraso y
  reconexión.
- La prueba e2e con reloj real (`hold-expiration.e2e-spec.ts`) midió de 1982 a 1991 ms del
  vencimiento al evento. El peor caso es el intervalo del barrido, unos 2 s.
- En el navegador, la reconexión incluye además la espera del cliente Socket.io antes de
  reintentar: 1 s ± 50 % por defecto. La resincronización completa tras volver la red queda
  entonces entre 0,5 y 1,5 s.
- La validación manual en Chrome (2026-11-19) confirmó en la interfaz, sin recargar, estos
  cambios: un bloqueo hecho por otro cliente, una cancelación hecha desde `/admin` (en la
  búsqueda abierta en otra pestaña), el paso a AGOTADO y los contadores del tablero
  (175 + 3 + 2 = 180).

## Variables de entorno

Ver [.env.example](.env.example). En docker compose se definen en `docker-compose.yml`, con los
mismos valores por defecto.

| Variable                 | Defecto                                       | Uso                                                                         |
| ------------------------ | --------------------------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`           | `postgresql://kata:kata@localhost:5432/kata`  | conexión de la api                                                          |
| `DB_POOL_MAX`            | `20`                                          | pool del adaptador `pg` de Prisma 7 (lo necesita la prueba de concurrencia) |
| `ADMIN_KEY`              | `demo-admin-key`                              | clave de administración; cámbiala fuera de la demo                          |
| `HOLD_TTL_SECONDS`       | `600`                                         | duración del bloqueo compartido                                             |
| `HOLD_SWEEP_INTERVAL_MS` | `2000`                                        | intervalo del barrido de bloqueos vencidos                                  |
| `CORS_ORIGINS`           | `http://localhost:4200,http://localhost:8080` | orígenes permitidos                                                         |
| `BODY_LIMIT`             | `16kb`                                        | tamaño máximo del body JSON                                                 |
| `RATE_LIMIT_MULTIPLIER`  | `1`                                           | multiplica los límites de solicitudes (el arnés e2e usa 100)                |
| `PORT`                   | `3000`                                        | puerto de la api                                                            |
| `LOG_LEVEL`              | `info`                                        | nivel de los logs JSON (pino)                                               |

## Estructura

```text
shared/      @kata/shared: enums, esquemas zod, códigos de error, eventos Socket.io
backend/
  prisma/    esquema, migraciones (0001 init, 0002 marca de tarjeta) y seed determinista
  src/       módulos flights, seats, bookings, realtime, admin, health y shared-kernel,
             cada uno con domain/ application/ infrastructure/
  test/      unit/ (dominio y casos de uso con dobles), contracts/ (Liskov), doubles/, e2e/
frontend/src/
  app/core/          ClientIdService, interceptores, ApiService, RealtimeService, mensajes de error
  app/core/flight-state/  reductor y sincronización por seq compartidos por mapa y tablero
  app/features/      search, seat-map, checkout, booking, dashboard, admin
  app/shared/        formatos, validación con esquemas de shared, componentes de UI
  styles/tokens.css  tokens de diseño (contraste ≥ 4,5:1 verificado)
docs/        arquitectura, uso de IA, registro de correcciones y prompts
specs/001-realtime-flight-booking/   spec, plan, research, data model, contratos, quickstart y tareas
```

## Puertas de calidad

Resultado del 2026-11-19, al cierre de la fase 10:

| Puerta                                 | Resultado                                                              |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm typecheck`                       | ✅ sin errores en los tres paquetes                                    |
| `pnpm lint`                            | ✅ sin errores; 49 plantillas sin `innerHTML` ni `bypassSecurityTrust` |
| `pnpm test`                            | ✅ 356 de 356                                                          |
| `pnpm test:cov`                        | ✅ umbral del 80 % cumplido (tabla de arriba)                          |
| `docker compose up --build` desde cero | ✅ 29–33 s; migraciones, seed y `/health` correctos                    |
| Quickstart (API y navegador)           | ✅ historias 1 a 4 y casos borde (reinicio con bloqueos y AGOTADO)     |

## Limitaciones conocidas

- La prueba de Playwright no forma parte de `pnpm test`: necesita el stack levantado y Chrome
  instalado.
- **Presupuesto del bundle inicial**: se subió a 1,2 MB de advertencia y 1,5 MB de error
  (`angular.json`). El bundle inicial pesa 1,01 MB sin comprimir y 196 kB transferidos; la
  mayor parte es zod (que llega con `@kata/shared` en CommonJS) y socket.io-client.
- No hay outbox. Si el proceso cae entre el commit y la publicación, los clientes se corrigen
  con el snapshot al detectar el hueco de `seq` o al reconectar (research §13).

## Documentación

- [Arquitectura](docs/architecture.md): módulos, diagramas, concurrencia, SOLID y DRY en el
  código, y seguridad.
- [Uso de IA](docs/ia.md) y [registro de correcciones](docs/ia-log.md).
- [Manual de la demo](docs/manual-demo.md): guion paso a paso de todas las funcionalidades para la
  sustentación.
- Especificación, plan, contratos y tareas:
  [specs/001-realtime-flight-booking/](specs/001-realtime-flight-booking/).
