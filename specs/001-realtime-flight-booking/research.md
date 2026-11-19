# Investigación y decisiones (Fase 0): Reservas de vuelos en tiempo real

**Fecha**: 2026-11-18 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Fuente de las decisiones: [docs/prompts/plan.md](../../docs/prompts/plan.md). Las entradas
marcadas **(revisión analyze)** corrigen los hallazgos críticos y altos de `/speckit-analyze`
del 2026-11-18. Cada entrada
sigue el formato Decisión / Razón / Alternativas descartadas. Las marcadas con **(refinamiento)**
no están en el documento fuente: completan o corrigen un detalle para cumplir la constitución o
la spec, sin contradecir ninguna decisión del documento.

No quedan elementos "NEEDS CLARIFICATION" en el contexto técnico.

---

## 1. Monorepo y paquetes

**Decisión**: monorepo con pnpm workspaces y tres paquetes: `backend/` (NestJS), `frontend/`
(Angular) y `shared/` (`@kata/shared`). TypeScript `strict` en todos. Scripts raíz: `dev`,
`test`, `lint`, `build`, `seed`. `docker-compose.yml` con `postgres:16`, `api` y `web`.

**Razón**: la constitución (Restricciones técnicas, principio III) exige el monorepo y un único
origen de contratos; pnpm resuelve el paquete `shared` por enlace local sin publicarlo.

**Alternativas descartadas**: Nx o Turborepo (añaden configuración sin beneficio para tres
paquetes en 1 día); repositorios separados (obligan a publicar `shared` y rompen el principio
III); npm/yarn workspaces (pnpm es el exigido).

## 2. Contratos compartidos con zod

**Decisión**: `@kata/shared` contiene los enums `SeatStatus` (AVAILABLE, HELD, BOOKED) y
`FlightStatus` (SCHEDULED, DELAYED, CANCELLED, SOLD_OUT), los esquemas zod (`SearchFlightsQuery`,
`FlightDto`, `SeatDto`, `HoldSeatResponse`, `CreateBookingRequest`, `BookingLookupRequest`,
`BookingDto`, `FlightStatsDto`, `ErrorResponse`), los tipos inferidos con `z.infer`, los
códigos de error y los eventos tipados de Socket.io (`ServerToClientEvents`,
`ClientToServerEvents` y constantes con sus nombres). El backend valida con esos mismos
esquemas mediante nestjs-zod; el frontend los usa para tipar y validar formularios.

**Razón**: un esquema define a la vez la validación en tiempo de ejecución y el tipo; cualquier
cambio incompatible rompe la compilación de ambos lados (principio III).

**Alternativas descartadas**: class-validator + class-transformer (decoradores atados a NestJS,
no reutilizables en Angular); generar tipos desde OpenAPI (paso extra y dos fuentes de verdad);
interfaces TypeScript sin validación (no protegen la entrada).

## 3. Arquitectura hexagonal modular

**Decisión**: módulos `flights`, `seats` (bloqueos), `bookings`, `realtime`, `admin` y
`health`. Cada uno con `domain/` (entidades y reglas puras), `application/` (casos de uso y
puertos) e `infrastructure/` (Prisma, controladores HTTP, gateway). Puertos principales:
`Clock`, `PaymentGateway`, `EventPublisher`, `UnitOfWork` y puertos segregados por
responsabilidad (§24): `FlightStatusPort` y `FlightQueryPort`; `SeatHoldsPort`,
`SeatQueryPort`, `SeatBookingPort` y `SeatReleasePort`; `BookingStore`, `BookingLookupPort` e
`IdempotencyStore`.

**Límites entre módulos (revisión analyze)**: cada módulo escribe solo sus tablas a través de
sus puertos (`flights` → `flights`; `seats` → `seats`; `bookings` → `bookings`,
`booking_seats` e `idempotency_keys`). Las operaciones que tocan varios módulos las orquesta un
caso de uso con el puerto `UnitOfWork`, que abre una transacción; los repositorios se unen a
ella de forma transparente mediante un contexto `AsyncLocalStorage`:

- `ConfirmBookingUseCase` usa `IdempotencyStore`, `SeatBookingPort.markBooked`,
  `BookingStore` y `FlightStatusPort.markSoldOutIfFull`.
- `ChangeFlightStatusUseCase` (admin) usa `FlightStatusPort.cancel` o `delay` y
  `SeatReleasePort.releaseAllHeld`.

Las primitivas de persistencia que usan varios módulos no pertenecen a ninguno. Viven en
`shared-kernel/infrastructure/persistence/`, detrás de puertos de `shared-kernel/application`
(`FlightWriteLock`, `FlightEventLog`, `FlightStatsReader`): lock de escritura del vuelo con asignación de
`seq` (§6), escritor de `flight_events` (§13) y consulta de estadísticas.

**Razón**: principio IV. El dominio decide las reglas (límite de 4, duración del bloqueo, reloj
compartido, transiciones válidas) y se prueba sin infraestructura; las garantías atómicas viven
en el adaptador de persistencia, que expone operaciones de intención (`tryHold`, `release`,
`confirm`, `releaseExpired`, `cancelFlight`) en vez de lecturas y escrituras sueltas.

`admin` y `health` se suman a los cuatro módulos que nombra la constitución: `admin` es un
adaptador HTTP con su caso de uso sobre el dominio de `flights`, y `health` es operativo.

**Alternativas descartadas**: capas por tipo técnico (controllers/, services/) en todo el
backend (mezcla dominios); CQRS con bus de comandos (excesivo para el alcance); helpers de
persistencia en `flights/infrastructure` importados por `seats` y `bookings` (viola el
principio IV: un módulo solo consume a otro por sus puertos); pasar el cliente transaccional
de Prisma como parámetro de los puertos (filtra Prisma a la capa de aplicación).

## 4. Persistencia: PostgreSQL + Prisma

**Decisión**: PostgreSQL 16 con Prisma como ORM y migraciones. Tablas: `flights` (con `seq`),
`seats`, `bookings`, `booking_seats`, `idempotency_keys` y `flight_events` (ver
[data-model.md](./data-model.md)). Las sentencias que Prisma no expresa (bloqueo de fila de
vuelo, `UPDATE ... RETURNING`, `pg_advisory_xact_lock`) se escriben con `$queryRaw`
parametrizado dentro de transacciones interactivas (`prisma.$transaction(async tx => ...)`).

**Razón**: la constitución exige PostgreSQL; Prisma da tipado y migraciones sin perder acceso a
SQL para las operaciones atómicas.

**Dimensionamiento de transacciones (revisión analyze)**: las escrituras de un mismo vuelo se
serializan en la fila del vuelo (§6). Con 100 bloqueos simultáneos, cada transacción
interactiva espera primero una conexión y luego el lock. Con los valores por defecto de Prisma
(2 s para obtener conexión, 5 s de duración máxima), las últimas solicitudes fallarían con
P2028 y romperían la prueba de concurrencia. Se fijan `maxWait = 10000` y `timeout = 10000` ms
en las transacciones interactivas y un pool de 20 conexiones. **(bloque 1)** Con Prisma 7 el pool
lo define el adaptador `@prisma/adapter-pg` (`max`, variable `DB_POOL_MAX`, por defecto 20), no
el parámetro `connection_limit` de la URL, que el adaptador ignora. Un P2028 residual
se registra y responde `500 INTERNAL_ERROR`; la prueba de concurrencia exige que no aparezca
ningún 500.

**Alternativas descartadas**: TypeORM (tipado más débil, más configuración); Drizzle (válido,
pero el documento fuente fija Prisma); SQL puro (más código repetido).

## 5. Bloqueo atómico de un asiento

**Decisión**: un único `UPDATE` condicional con `prisma.seat.updateMany` sobre el asiento, con
la condición `status = AVAILABLE OR (status = HELD AND hold_expires_at < :now)`, que pone
`HELD`, `held_by`, `hold_expires_at` y `version + 1`. Si `count = 1` el cliente gana; si
`count = 0` responde `409 SEAT_UNAVAILABLE`. `:now` viene del puerto `Clock`, nunca de `now()`
de la base de datos.

**Razón**: principio I. PostgreSQL bloquea la fila durante el `UPDATE` y reevalúa la condición
tras esperar a un escritor concurrente; solo uno puede cumplirla. No hay ventana entre lectura y
escritura.

**Alternativas descartadas**: `SELECT ... FOR UPDATE` seguido de `UPDATE` (prohibido por el
principio I aunque sea correcto); bloqueo optimista leyendo `version` y reintentando (lectura
previa y reintentos innecesarios); Redis o un lock distribuido (infraestructura extra, viola
VII).

## 6. Bloqueo de la fila del vuelo y orden de locks **(refinamiento)**

**Decisión**: toda operación que cambia asientos o el estado de un vuelo empieza su transacción
bloqueando la fila del vuelo con una sentencia condicional que verifica a la vez que el vuelo
admite la operación, por ejemplo para un bloqueo: `UPDATE flights SET seq = seq WHERE id = :id
AND status IN ('SCHEDULED','DELAYED') AND departure_at > :now RETURNING seq`. Sin fila
devuelta, la operación responde `422 FLIGHT_NOT_BOOKABLE`. El escritor de eventos (§13) avanza
después `seq` en n al registrar los n eventos de la operación, sobre la fila ya bloqueada; si
un paso posterior falla, el rollback deshace todo, de modo que la secuencia no tiene huecos.
Orden de locks fijo en todas las operaciones: **vuelo → advisory lock del cliente →
asientos**. La primitiva vive en `shared-kernel/infrastructure/persistence/flight-write-lock.ts`
detrás del puerto `FlightWriteLock`, porque la usan `seats`, `bookings` y `admin` (§3,
revisión analyze).

**Razón**: sin este paso hay dos defectos:

1. **Carrera con la cancelación**: un bloqueo que verifica el vuelo en una subconsulta puede
   comprometerse justo después de que la cancelación liberó los bloqueos, y dejar un asiento
   bloqueado en un vuelo cancelado. Con el lock del vuelo primero, cancelación y bloqueo se
   serializan.
2. **Interbloqueos y orden de eventos**: si unas operaciones tocan asiento → vuelo y otras
   vuelo → asiento, PostgreSQL puede abortar una por interbloqueo. Un orden único lo evita.
   Además, el lock de fila garantiza que el orden de `seq` coincide con el orden de commit.

El costo es serializar las escrituras de un mismo vuelo; con 180 asientos y transacciones de
milisegundos no afecta los objetivos, siempre que las transacciones estén dimensionadas (§4).

**Alternativas descartadas**: asignar `seq` con una secuencia de PostgreSQL por vuelo (no
garantiza orden igual al commit); subconsulta `EXISTS` sobre el vuelo dentro del `UPDATE` del
asiento (deja la carrera descrita); nivel de aislamiento SERIALIZABLE (obliga a reintentar
errores de serialización en todas las rutas).

## 7. Límite de 4 bloqueos y reloj compartido

**Decisión**: dentro de la transacción del bloqueo, tomar
`pg_advisory_xact_lock(hashtext(clientId), hashtext(flightId))`, contar los bloqueos vigentes
del cliente en el vuelo y obtener su `hold_expires_at` común. Si ya tiene 4, responde
`422 HOLD_LIMIT_REACHED`. El asiento nuevo recibe ese mismo vencimiento; si el cliente no tiene
bloqueos vigentes, `:now + HOLD_TTL_SECONDS` (600 por defecto). Después se ejecuta el `UPDATE`
condicional de la decisión 5. Sumar asientos nunca extiende el plazo.

**Razón**: el límite y el reloj compartido dependen de los bloqueos del propio cliente, no de
la disputa por el asiento. El advisory lock serializa las solicitudes del mismo cliente en el
mismo vuelo (por ejemplo, dos pestañas); la propiedad del asiento la sigue decidiendo el
`UPDATE` condicional. Esta lectura está registrada en el Constitution Check del plan como
excepción justificada al principio I.

Con la decisión 6 el lock del vuelo ya serializa estas solicitudes; el advisory lock se
mantiene como se decidió en el documento fuente, porque protege la regla del límite por sí
mismo si en el futuro cambia la estrategia de lock del vuelo, y su costo es despreciable.

**Alternativas descartadas**: restricción en la base de datos para el límite (no hay forma
declarativa simple de "máximo 4 filas vigentes por cliente y vuelo" con vencimiento por
tiempo); vencimiento independiente por asiento (descartado en Clarifications); reiniciar el
reloj al sumar asientos (descartado en Clarifications).

## 8. Liberación manual

**Decisión**: `UPDATE` condicional `HELD → AVAILABLE WHERE held_by = :clientId AND
hold_expires_at > :now`. Si `count = 0`, responde `409 SEAT_NOT_HELD` (el asiento no es del
cliente o su bloqueo ya venció). Emite `seat:released` con `reason: MANUAL`.

**Razón**: mismo patrón atómico; nadie libera un asiento ajeno (RF-011).

**Alternativas descartadas**: responder 204 aunque no fuera suyo (ocultaría errores del
cliente); 404 (el asiento existe).

## 9. Confirmación de la reserva

**Decisión** **(revisión analyze)**: el caso de uso `ConfirmBookingUseCase` ejecuta estos pasos dentro
del puerto `UnitOfWork` (una sola transacción). Cada módulo escribe solo sus tablas a través
de su puerto (§3):

1. `IdempotencyStore.reserve`: inserta la clave de idempotencia (decisión 10).
2. Lock de escritura del vuelo con la condición `status IN ('SCHEDULED','DELAYED')` (primitiva
   compartida, §6). Si falla, `422 FLIGHT_NOT_BOOKABLE` (por ejemplo, vuelo cancelado).
3. `SeatBookingPort.markBooked`: `UPDATE` condicional `HELD → BOOKED WHERE flight_id = :f
   AND held_by = :c AND hold_expires_at > :now AND (row, letter) IN (:asientos de la
   solicitud) RETURNING id`.
4. Verificación posterior a la escritura, dentro de la misma transacción: el conteo debe ser
   igual al número de asientos de la solicitud (si no, rollback y `410 HOLD_EXPIRED`), y el
   cliente no debe conservar otros bloqueos vigentes en el vuelo (si no, rollback y
   `422 PASSENGERS_MISMATCH`; para comprar menos, el cliente libera antes los que no quiere).
5. `PaymentGateway.charge` con los datos de la tarjeta solo en memoria; devuelve marca y últimos 4
   dígitos, lo único que se guarda (§25). Si `FakePaymentGateway` rechaza: rollback (los asientos siguen
   `HELD` con su vencimiento original) y `402 PAYMENT_DECLINED`.
6. `BookingStore.save`: inserta `bookings` y `booking_seats` (`UNIQUE(seat_id)` como
   última defensa).
7. `FlightStatusPort.markSoldOutIfFull`: marca el vuelo `SOLD_OUT` con una sentencia
   condicional si no quedan asientos sin reservar (decisión 14).
8. Inserta los eventos en `flight_events`, hace commit y publica.

El código de reserva son 6 caracteres de `A-Z0-9` aleatorios con `UNIQUE`; ante colisión se
reintenta con otro código.

**Razón**: todo o nada (RF-017). Cobrar dentro de la transacción, con las filas ya pasadas a
`BOOKED`, garantiza que nunca se cobra sin asientos ni se reservan asientos sin cobro. Con un
pago ficticio e instantáneo no alarga la transacción.

**Alternativas descartadas**: cobrar antes de la transacción (cobro sin asientos si el bloqueo
vence en medio); autorizar y capturar en dos fases (necesario con un proveedor real, excesivo
para un pago ficticio; queda anotado para producción).

## 10. Idempotencia de la confirmación

**Decisión**: header `Idempotency-Key` (UUID) obligatorio en `POST /bookings`. La tabla
`idempotency_keys` tiene `UNIQUE(client_id, key)`, el hash de la solicitud y el `booking_id`. La
clave se inserta en la misma transacción de la confirmación:

- Si un duplicado llega mientras la primera transacción está en curso, PostgreSQL lo hace
  esperar en el índice único; si la primera hace commit, el duplicado recibe la violación de
  unicidad, lee la reserva guardada y responde `200` con la misma reserva y el header
  `Idempotent-Replayed: true`.
- Si la primera hizo rollback (pago rechazado, bloqueo vencido), la clave no quedó guardada y
  el reintento se procesa de nuevo.
- La misma clave con otro contenido responde `422 IDEMPOTENCY_KEY_REUSED`.

El frontend genera una clave al abrir el pago, la reutiliza en reintentos y genera otra tras
una reserva exitosa.

**Razón**: RF-020 y la prueba obligatoria de idempotencia; no requiere estado "en curso" ni
limpieza.

**Alternativas descartadas**: deduplicar por los asientos bloqueados del cliente (un reintento
tras el commit ya no encuentra bloqueos y respondería 410); tabla con estado "procesando"
(requiere expirar estados huérfanos).

## 11. Expiración de bloqueos

**Decisión**: un job con `@nestjs/schedule` cada 2 s (`HOLD_SWEEP_INTERVAL_MS`, por defecto
2000, configurable) recorre los vuelos con bloqueos vencidos. Por cada vuelo: bloquea la fila del vuelo,
libera con `UPDATE seats ... WHERE status = 'HELD' AND hold_expires_at <= :now RETURNING`,
avanza `seq` y publica `seat:released` con `reason: EXPIRED`. Al arrancar, el job corre una
vez antes de aceptar tráfico. Además, toda operación trata un bloqueo vencido como disponible
(verificación perezosa): el `UPDATE` de bloqueo lo acepta, la confirmación lo rechaza, y el
snapshot y las estadísticas lo cuentan como disponible.

**Razón**: la corrección no depende del job; el job solo existe para notificar a tiempo
(RF-012) y limpiar tras un reinicio (RF-032).

**Intervalo**: el documento fuente proponía 5 s, pero en el peor caso (un bloqueo que vence
justo después de una pasada) la notificación llegaría a los 5 s más el tiempo de la
transacción, por encima del máximo de CE-003. Con 2 s el peor caso es de unos 2 s, con margen
amplio. El costo es una consulta indexada (`hold_expires_at WHERE status = 'HELD'`) cada 2 s,
despreciable. Ajuste confirmado por el usuario el 2026-11-18.

**Alternativas descartadas**: intervalo de 5 s (incumple CE-003 en el peor caso); 1 s o menos
(más carga sin beneficio visible); un temporizador por bloqueo en memoria (se pierde al reiniciar,
no escala a varias instancias); `pg_cron` (extensión extra); solo verificación perezosa sin job
(los demás usuarios no se enterarían del vencimiento).

## 12. Reloj inyectable

**Decisión**: puerto `Clock` con `now(): Date`. `SystemClock` en producción y `FakeClock`
controlable en pruebas unitarias y e2e (se reemplaza el proveedor en el módulo de prueba). Toda
comparación de tiempo en SQL recibe `:now` como parámetro.

**Razón**: principio V; permite probar vencimientos sin esperar.

**Alternativas descartadas**: temporizadores falsos de Jest (no controlan el `now()` de la base
de datos); usar `now()` de PostgreSQL (no se puede controlar desde la prueba).

## 13. Eventos y secuencia por vuelo

**Decisión**: los casos de uso insertan sus eventos en `flight_events` dentro de la
transacción, con la `seq` asignada por el lock del vuelo (decisión 6; una operación que genera
n eventos avanza `seq` en n y los numera consecutivamente). Tras el commit los publican en un
EventBus interno (EventEmitter2) a través del puerto `EventPublisher`; el `RealtimeGateway` los
traduce a Socket.io. El escritor de eventos es una primitiva compartida
(`shared-kernel/infrastructure/persistence/flight-events.writer.ts`).

**Rooms y secuencia (revisión analyze)**:

- En el room `flight:{id}` solo viajan `seat:held`, `seat:released`, `seat:booked` y
  `flight:updated`. Cada uno tiene una `seq` distinta y consecutiva. Ahí **no** se emite
  `flight:stats`: el mapa y el tablero derivan los contadores de su propio estado de asientos
  (snapshot + eventos). Así, en ese room ningún evento repite la `seq` del anterior, y aplica
  literalmente la regla del principio II (descartar `seq` ≤ última; ante un salto, volver a
  pedir el estado por HTTP).
- En el room `search` solo viaja `flight:stats`: uno por transacción, con la `seq` del último
  evento de esa transacción y el resumen completo del vuelo (estado, horas, `delayed`,
  `availableSeats`, contadores y `change` si cambió el estado). El cliente lo aplica si su
  `seq` es la siguiente a la última vista para ese vuelo. Ante un salto (transacciones con
  varios eventos), vuelve a pedir el vuelo con `GET /api/flights/:id`, que incluye `seq`, y
  agrupa los pedidos en 250 ms.

**Snapshot coherente (revisión analyze)**: `GET /api/flights/:id/seats` y
`GET /api/flights/:id/stats` leen `flights.seq` y los asientos dentro de una transacción de
solo lectura `REPEATABLE READ`, de modo que ambos datos corresponden al mismo instante. Si se
leyeran por separado en `READ COMMITTED`, un commit intermedio podría dejar un `seq` posterior
a los asientos leídos, y el evento correspondiente nunca se aplicaría. `GET /api/flights/:id`
calcula `seq` y `availableSeats` en una sola sentencia, que ya es coherente.

**Orden de publicación (nota U5)**: dos transacciones de un mismo vuelo hacen commit en orden
de `seq`, pero publican después del commit de forma asíncrona, así que un cliente puede recibir
`seq` 6 antes que 5. El reductor lo trata como un salto: pide el snapshot (que ya refleja 5 y 6)
y descarta después el 5 por viejo. El resultado es correcto; el costo es un pedido de snapshot
extra, poco frecuente con la carga del prototipo. Se descartó serializar la publicación con una
cola por vuelo: añade estado en el gateway para un beneficio menor.

**Razón**: principio II (publicar solo tras el commit, cada evento con `flightId`, `seatId`,
estado, `seq` y fecha). `flight_events` da el registro de actividad del tablero al cargar
(RF-026: últimos 50 eventos) y una auditoría gratuita.

**Alternativas descartadas**: patrón outbox con publicador asíncrono (más robusto ante una
caída entre commit y publicación, pero excesivo para un monolito; un evento perdido se corrige
con el snapshot por hueco de `seq`); guardar el registro de actividad solo en memoria (se pierde
al reiniciar y no muestra eventos previos a abrir el tablero).

## 14. Estados del vuelo: AGOTADO, retraso y cancelación

**Decisión**:

- **AGOTADO**: en la misma transacción de la confirmación,
  `UPDATE flights SET status = 'SOLD_OUT' WHERE id = :f AND status IN ('SCHEDULED','DELAYED')
  AND NOT EXISTS (SELECT 1 FROM seats WHERE flight_id = :f AND status <> 'BOOKED')`; si cambia,
  se emite `flight:updated`. Nunca vuelve atrás (no hay cancelación de reservas).
- **Retraso** **(refinamiento)**: `FlightStatusPort.delay`. `flights` guarda `scheduled_departure_at` (original) y
  `departure_at` / `arrival_at` (vigentes). El retraso exige `newDepartureAt > departure_at`
  (si no, `422 INVALID_DELAY`) y desplaza la llegada lo mismo. El estado pasa a `DELAYED`,
  salvo si el vuelo está `SOLD_OUT`, que conserva su estado; el retraso se deduce de
  `departure_at > scheduled_departure_at`. La búsqueda usa `departure_at`, así que un retraso
  que cambia de día mueve el vuelo a los resultados de la nueva fecha.
- **Cancelación** **(revisión analyze)**: `ChangeFlightStatusUseCase` ejecuta dentro de `UnitOfWork`:
  lock del vuelo con `status <> 'CANCELLED'` (si no, `422 FLIGHT_STATUS_CONFLICT`),
  `FlightStatusPort.cancel` (pasa a `CANCELLED`) y `SeatReleasePort.releaseAllHeld`
  (libera todos los bloqueos con `RETURNING`). Emite `seat:released` (`reason:
  FLIGHT_CANCELLED`) por asiento y `flight:updated`. Las reservas existentes se conservan.

**Razón**: cubre los supuestos de la spec (AGOTADO solo por reservas, AGOTADO retrasado sigue
sin admitir bloqueos, CANCELADO final) con sentencias atómicas.

**Alternativas descartadas**: un enum que combine estados (por ejemplo, `SOLD_OUT_DELAYED`;
explota combinaciones); calcular AGOTADO al leer (la spec pide notificar el cambio).

## 15. Identidad anónima y privacidad del dueño del bloqueo **(refinamiento)**

**Decisión**: el `clientId` es un UUID v4 que el frontend genera y guarda en `localStorage`
(`ClientIdService`). Backend, handshake del socket y frontend lo validan con el mismo
`ClientIdSchema` de `@kata/shared` (UUID v4; otra versión → `400 CLIENT_ID_REQUIRED`). El
`holderTag` se calcula en un único sitio (`holderTagOf`, `shared-kernel/domain`). Se envía en el header `X-Client-Id` (obligatorio en bloqueos, reservas y
`/clients/me/holds`; sin él, `400 CLIENT_ID_REQUIRED`) y en el handshake del socket. **Nunca se
difunde a otros clientes**: eventos y snapshots llevan `holderTag`, los primeros 16 caracteres
hexadecimales de SHA-256(clientId). `GET /clients/me/holds` devuelve el `holderTag` propio
para que el frontend reconozca sus asientos, también en otra pestaña.

**Razón**: el `clientId` es la única credencial del cliente; difundirlo permitiría a cualquiera
liberar o comprar con los bloqueos de otro enviando ese header. El tag permite el caso borde de
"mismas dos pestañas, mismo cliente" sin exponer la credencial.

**Alternativas descartadas**: difundir `heldBy` en claro (suplantación trivial); un room privado
por cliente con eventos personalizados (más eventos y lógica en el gateway).

## 16. Tiempo real con Socket.io

**Decisión**: namespace `/realtime`; rooms `flight:{flightId}` (mapa y tablero) y `search`
(resultados). Cliente → servidor: `flight:join`, `flight:leave`, `search:subscribe`. Servidor →
cliente: `seat:held`, `seat:released`, `seat:booked` y `flight:updated` al room del vuelo, y
`flight:stats` (resumen por transacción) al room `search`, de todos los vuelos; el frontend
filtra por los vuelos listados (ver §13). Catálogo completo en
[contracts/realtime-events.md](./contracts/realtime-events.md).

**Razón**: principio II (comandos por HTTP, eventos por socket). Un único room de búsqueda es
simple y el volumen del prototipo es bajo.

**Alternativas descartadas**: un room por vuelo para los resultados (más suscripciones al
cambiar de búsqueda); Server-Sent Events (sin rooms ni reconexión con estado); comandos por el
socket (prohibido por el principio II).

## 17. API REST y errores

**Decisión**: endpoints bajo `/api` según [contracts/openapi.yaml](./contracts/openapi.yaml).
Un filtro global devuelve siempre `{ code, message, details }`. Mapa de códigos HTTP:

| HTTP | Uso | Códigos |
|------|-----|---------|
| 400 | Petición mal formada o sin headers obligatorios | `BAD_REQUEST`, `CLIENT_ID_REQUIRED`, `IDEMPOTENCY_KEY_REQUIRED` |
| 401 | Clave de administrador ausente o incorrecta | `ADMIN_UNAUTHORIZED` |
| 402 | Pago ficticio rechazado | `PAYMENT_DECLINED` |
| 404 | Recurso inexistente | `FLIGHT_NOT_FOUND`, `SEAT_NOT_FOUND`, `BOOKING_NOT_FOUND` |
| 409 | Conflicto de asiento (ya bloqueado o reservado por otro, o no es del cliente) | `SEAT_UNAVAILABLE`, `SEAT_NOT_HELD` |
| 410 | Bloqueo expirado | `HOLD_EXPIRED` |
| 429 | Demasiados intentos (límite de solicitudes, §25) | `TOO_MANY_REQUESTS` |
| 422 | Validación de esquema o de negocio | `VALIDATION_ERROR`, `HOLD_LIMIT_REACHED`, `PASSENGERS_MISMATCH`, `INVALID_DELAY`, `IDEMPOTENCY_KEY_REUSED`, `FLIGHT_NOT_BOOKABLE`, `FLIGHT_STATUS_CONFLICT` |

Los errores de zod se devuelven como `422 VALIDATION_ERROR` con la lista de campos en
`details` (nestjs-zod responde 400 por defecto; el filtro lo ajusta). La clave de administrador
se compara en tiempo constante (`timingSafeEqual`).

**Razón**: principio VI (constitución 1.0.1, que lista el 401 y los casos 422 de esta tabla).
**(revisión analyze)** La constitución reserva el 409 para conflictos de asiento. Por eso un
vuelo que no admite bloqueos ni confirmaciones (`FLIGHT_NOT_BOOKABLE`) y un cambio sobre un
vuelo ya cancelado (`FLIGHT_STATUS_CONFLICT`) se tratan como reglas de negocio y responden
422.

**Alternativas descartadas**: 403 para la clave incorrecta (no hay identidad autenticada que
autorizar; 401 es la convención para credencial ausente o inválida); GraphQL (los códigos HTTP
son parte del contrato exigido).

## 18. Búsqueda y zona horaria

**Decisión**: la fecha de búsqueda se interpreta en `America/Bogota`; se devuelven los vuelos
con `departure_at` dentro de ese día, ordenados ascendentemente, incluidos los cancelados (se
muestran con su estado). "Fecha pasada" significa anterior a hoy en Bogotá. Los asientos
disponibles se cuentan con verificación perezosa.

**Razón**: la spec fija la hora local de Colombia y muestra los vuelos cancelados.

**Alternativas descartadas**: días en UTC (los vuelos nocturnos cambiarían de día).

## 19. Frontend

**Decisión**: Angular en su versión estable vigente (se fija la exacta al crear el proyecto),
componentes standalone, signals y RxJS.

- **Rutas**: `/search`, `/flights/:id/seats`, `/checkout`, `/booking/:code`,
  `/flights/:id/dashboard`, `/admin`.
- **RealtimeService**: envuelve `socket.io-client` tipado con los eventos de `shared`, expone un
  Observable por evento y un signal `connection` (`connected` | `reconnecting`).
- **Estado del vuelo** **(revisión analyze)**: un único reductor puro
  (`core/flight-state/flight-state.reducer.ts`) lo comparten el mapa y el tablero; los
  contadores del tablero se derivan del estado de asientos, nunca de un evento aparte.
- **Resultados de búsqueda**: aplican `flight:stats` si su `seq` es la siguiente para ese
  vuelo; ante un salto, piden `GET /api/flights/:id` (agrupado en 250 ms).
- **Estado del mapa**: el reductor aplica solo el evento con `seq` siguiente a la última vista. Al
  entrar: unirse al room, pedir el snapshot, guardar en un buffer los eventos recibidos
  mientras tanto y aplicar los de `seq` mayor al del snapshot. Si hay hueco de `seq` o una
  reconexión, se vuelve a pedir el snapshot y las acciones quedan deshabilitadas hasta
  tenerlo.
- **Interacción**: clic optimista que se revierte con 409; cuenta regresiva del reloj
  compartido calculada con el desfase entre `serverNow` y la hora local.
- **ClientIdService** + `HttpInterceptor` para `X-Client-Id`; otro interceptor traduce el
  `code` del error a mensajes en español mostrados en un toast.
- **Mapa**: componente propio con CSS Grid de botones, 7 columnas (A B C, pasillo, D E F), número
  de fila a ambos lados y frente del avión arriba. Cada asiento tiene un `aria-label` del tipo
  "Asiento 12C, pasillo, disponible", se navega con flechas (roving tabindex) y se selecciona
  con Enter o Espacio. Los estados se muestran con color e icono. Resaltado de unos 600 ms
  ante cambios remotos sin mover el foco ni la vista, y una región `aria-live="polite"` para el
  asiento enfocado.
- **Layout**: panel de resumen sticky a la derecha (abajo en pantallas de 640 px o menos) con asientos, total y barra
  de cuenta regresiva; badge de conexión en el header. Angular Material solo para formularios,
  diálogos y toasts. Tokens de diseño en variables CSS, mobile first y contraste mínimo 4,5:1.
- **Boleto tras recargar**: `/booking/:code` muestra el boleto de la respuesta de compra; si se
  recarga, pide el correo y usa `POST /bookings/lookup`.

**Razón**: cubre RUX-001 a RUX-036 con componentes accesibles nativos (botones).

**Alternativas descartadas**: canvas o SVG para el mapa (accesibilidad y foco manuales);
NgRx (excesivo; signals y un reductor puro bastan); Angular Material para todo (el mapa
necesita control total del diseño).

## 20. Pruebas

**Decisión**:

- **Backend, dominio**: Jest, sin infraestructura (límite, reloj compartido, transiciones de
  vuelo, generación de código).
- **Backend, casos de uso (constitución 1.1.0, principio V)**: cada caso de uso tiene pruebas
  unitarias escritas antes que él, con dobles de sus puertos en `backend/test/doubles/`
  (`InMemoryUnitOfWork`, `StubFlightWriteLock`, `InMemoryFlightEventLog`,
  `RecordingEventPublisher`, almacenes en memoria de asientos y reservas, `ScriptedPaymentGateway`
  y `FakeClock`).
- **Pruebas de contrato (L de SOLID)**: una misma batería por puerto se ejecuta contra cada
  implementación intercambiable: `Clock` (`SystemClock` y `FakeClock`), `EventPublisher`
  (`EventEmitterPublisher` y `RecordingEventPublisher`) y `PaymentGateway`
  (`FakePaymentGateway` y `ScriptedPaymentGateway`).
- **Cobertura**: `pnpm test:cov` exige ≥ 80 % de líneas y ramas en `backend/src/**/domain`,
  `backend/src/**/application` y `shared/`; el frontend publica su cobertura sin umbral.
- **Backend, e2e**: Jest + Supertest contra PostgreSQL real con Testcontainers; si existe
  `TEST_DATABASE_URL` se usa esa base (por ejemplo, el contenedor de docker compose). Casos
  obligatorios: 100 `POST /hold` en paralelo al mismo asiento con `clientId` distintos dan
  exactamente 1 respuesta 201 y 99 respuestas 409; reloj compartido; bloqueo vencido da 410 al
  confirmar; idempotencia; cancelación con bloqueos activos; clave de admin incorrecta da 401;
  lookup con correo incorrecto da 404; además, el límite de 4 y el pago rechazado conservan los
  bloqueos.
- **Tiempos (nota G2)**: la prueba de expiración exige, con reloj real y barrido de 2000 ms,
  que el evento `EXPIRED` llegue a un socket suscrito en ≤ 3 s tras el vencimiento. La del
  gateway exige que un segundo socket reciba el evento en < 1 s desde la respuesta del comando.
  La validación final anota en el README los tiempos medidos.
- **Frontend**: runner por defecto del Angular CLI (Vitest); pruebas unitarias del reductor del
  mapa (eventos desordenados, duplicados y con huecos), `RealtimeService`, interceptores
  (`X-Client-Id` y traducción de errores), componente del mapa (teclado y `aria-label`) y panel
  de resumen.
- **Opcional**: Playwright con dos contextos de navegador para la prueba de dos pestañas.

**Razón**: principio V. La prueba de concurrencia solo es válida contra PostgreSQL real.

**Alternativas descartadas**: SQLite o una base en memoria para la concurrencia (no reproduce el
bloqueo de filas); mocks del repositorio para concurrencia (no prueban nada); medir la cobertura
con las e2e (oculta reglas sin prueba unitaria y es lenta).

## 21. Despliegue local

**Decisión**: `docker compose up` levanta `postgres:16` (con healthcheck), `api` (aplica
`prisma migrate deploy`, ejecuta el seed si la base está vacía y arranca) y `web` (build de
Angular servido por nginx, que hace de proxy para `/api`, `/health` y `/socket.io` con soporte de
upgrade). Variables: `DATABASE_URL`, `ADMIN_KEY`, `HOLD_TTL_SECONDS`, `HOLD_SWEEP_INTERVAL_MS`,
`PORT`, `LOG_LEVEL`. **(nota U3)** En desarrollo, `frontend/proxy.conf.json` reenvía de :4200 a
:3000 `/api`, `/health` y `/socket.io` (con `ws: true`), que es la ruta HTTP por la que viaja el
namespace `/realtime`.

**Razón**: CE-004 y principio VII: un solo comando, mismo origen (sin CORS).

**Alternativas descartadas**: servir Angular desde NestJS (acopla los despliegues); `ng serve`
en el contenedor (no es un build de producción).

## 22. Datos de prueba

**Decisión**: el seed es determinista. Usa un PRNG con semilla fija y fechas relativas a "hoy"
en Bogotá. Crea los 5 aeropuertos y las 20 rutas dirigidas entre BOG, MDE, CLO, CTG y BAQ, con
3 vuelos diarios por ruta durante 7 días (420 vuelos), cada uno con 180 asientos (30 × 6). Los
identificadores son deterministas (UUID v5 a partir del número de vuelo y la fecha). Para
probar AGOTADO y el tablero incluye un vuelo casi lleno (1 asiento libre). Volver a ejecutarlo
borra y regenera. **(nota U4)** Los 179 asientos reservados del vuelo casi lleno pertenecen a
reservas reales agrupadas de a 4 (44 reservas de 4 asientos y 1 de 3), con comprador,
pasajeros y código deterministas, para que no haya asientos `BOOKED` sin reserva.

**Razón**: "seeds reproducibles" (principio VIII) y datos útiles para demostrar cada historia.

**Alternativas descartadas**: datos aleatorios por ejecución (no reproducibles); fechas fijas
(caducan).

## 23. Calidad y observabilidad

**Decisión**: ESLint + Prettier compartidos desde la raíz, sin `any` (regla
`@typescript-eslint/no-explicit-any` como error). Logs JSON con pino (nestjs-pino) que incluyen
`flightId`, `seatId` y el `holderTag` del cliente cuando aplica (nunca el `clientId` en claro
ni datos de tarjeta). `GET /health`
(fuera del prefijo `/api`, como pide la constitución, principio VIII) verifica la base con
`SELECT 1`. Commits con Conventional Commits. **(nota G3)** Los scripts raíz `lint`,
`typecheck` (`tsc --noEmit` en los tres paquetes) y `test` forman la puerta de calidad.
**(constitución 1.1.0)** ESLint añade `complexity` ≤ 10, `max-lines-per-function` ≤ 40 (las
pruebas quedan exentas solo de esta regla, por sus bloques `describe`), `max-params` ≤ 4 y
`no-console`; la cobertura (`pnpm test:cov`) se suma a la puerta.

**Razón**: principio VIII.

**Alternativas descartadas**: winston (más lento y configuración más verbosa); métricas o
tracing (fuera del alcance del prototipo).

## 24. Aplicación de SOLID y DRY **(constitución 1.1.0)**

**Decisión**: cada letra de SOLID tiene una regla verificable y un ejemplo concreto en el código:

| Principio | Regla | Ejemplo concreto (clase o puerto) | Archivo |
|-----------|-------|-----------------------------------|---------|
| S | Un caso de uso por clase; controladores y gateway solo traducen protocolo | `HoldSeatUseCase`, `ReleaseSeatUseCase`, `ConfirmBookingUseCase`, `ChangeFlightStatusUseCase`; `SeatsController` valida y delega | `backend/src/seats/application/hold-seat.use-case.ts`, `backend/src/seats/infrastructure/seats.controller.ts` |
| O | Variantes nuevas = adaptadores nuevos detrás de puertos, sin tocar casos de uso | Un proveedor de pago real sería otro adaptador de `PaymentGateway`; cambiar Socket.io por SSE sería otro `EventPublisher` | `backend/src/bookings/application/ports/payment-gateway.port.ts` |
| L | Implementaciones intercambiables que pasan la misma prueba de contrato | `FakePaymentGateway` y `ScriptedPaymentGateway`; `SystemClock` y `FakeClock`; `EventEmitterPublisher` y `RecordingEventPublisher` | `backend/test/contracts/*.contract.ts` |
| I | Puertos pequeños y enfocados; ningún repositorio "dios" | `SeatHoldsPort` (bloquear, liberar) separado de `SeatQueryPort` (snapshot, mis bloqueos), `SeatBookingPort` y `SeatReleasePort`; `FlightStatusPort` separado de `FlightQueryPort`; `FlightEventLog` (escritura) separado de `FlightEventQueryPort` (lectura) | `backend/src/seats/application/ports/` |
| D | Dominio y aplicación dependen de interfaces; la infraestructura enlaza con tokens de Nest | `HoldSeatUseCase` es una clase plana (sin `@Injectable()` ni `@Inject()`) que recibe `FlightWriteContext` y `SeatHoldsPort`; `SeatsModule` la registra con `useFactory` e `inject: [FLIGHT_WRITE_CONTEXT, SEAT_HOLDS_PORT]` | `backend/src/seats/seats.module.ts`, `backend/src/shared-kernel/application/flight-write-context.ts` |

**Objetos de dependencias**: `max-params` ≤ 4 choca con la inyección por constructor cuando un
caso de uso necesita muchos puertos. Se agrupan en objetos de dependencias provistos por token:
`FlightWriteContext` (`UnitOfWork`, `FlightWriteLock`, `FlightEventLog`, `FlightStatsReader`,
`EventPublisher`, `Clock`) y `BookingPorts` (`IdempotencyStore`, `SeatBookingPort`,
`PaymentGateway`, `BookingStore`, `FlightStatusPort`). `ConfirmBookingUseCase` recibe dos
parámetros.

**DRY** (una sola definición de cada cosa):

| Qué | Única definición | La usan |
|-----|------------------|---------|
| Tipos, esquemas zod, enums y eventos | `@kata/shared` | backend (validación de entrada con `createZodDto`) y frontend (formularios y tipado) |
| Código de error → estado HTTP | `ERROR_HTTP_STATUS` en `@kata/shared` | filtro global del backend |
| Formato de error y traducción | `ApiExceptionFilter` (backend) | todas las rutas |
| Código de error → mensaje en español | `error-messages.ts` (frontend) | interceptor de errores y pantallas |
| Identidad del cliente | `ClientIdSchema` y `holderTagOf` | decorador HTTP, handshake del socket, logger y frontend |
| Marca de tarjeta, código de asiento, fecha de Bogotá | `detectCardBrand`, `seat-code.ts`, `toBogotaDate` en `@kata/shared` | backend y frontend |
| Lock del vuelo y numeración de eventos | `FlightWriteLock` y `FlightEventLog` | todos los casos de uso que escriben |

**Razón**: constitución 1.1.0 (principios III, IV y VIII). Con reglas verificables, SOLID y DRY
se revisan en el código y no quedan como intención.

**Alternativas descartadas**: un repositorio por agregado con todos los métodos (viola I y
obliga a dobles enormes); desactivar `max-params` para constructores (oculta dependencias
excesivas); validar formularios con validadores propios de Angular (duplica las reglas de
`@kata/shared`).

## 25. Seguridad **(constitución 1.1.0, principio X)**

**Decisión**:

| Medida | Amenaza que mitiga | Dónde | Alternativa descartada |
|--------|--------------------|-------|------------------------|
| Validación zod de body, query, params, headers y payloads de socket con los esquemas de `@kata/shared` | Inyección, datos malformados, errores 500 provocados | `zod-validation.ts`, `@ClientId()`, `socket-handshake.ts` | Validación manual por endpoint (incompleta y duplicada) |
| `X-Client-Id` exige UUID v4 | Identificadores adivinables o colisiones elegidas por un atacante | `ClientIdSchema` | Aceptar cualquier cadena (permite suplantar con valores triviales) |
| helmet | Clickjacking, sniffing de MIME, cabeceras inseguras por defecto | `app.setup.ts` | Cabeceras a mano (fácil olvidar alguna) |
| CORS restringido a `CORS_ORIGINS` | Que otro sitio use la API con el navegador del usuario | `app.setup.ts` | `origin: *` (abre la API a cualquier página) |
| Límite de body (16 kb) | Agotamiento de memoria con cuerpos enormes | `app.setup.ts` | Límite por defecto de 100 kb (innecesariamente alto) |
| Límite de solicitudes (`@nestjs/throttler`) con dos contadores: por IP en todas las rutas limitadas y, además, por cliente en bloqueo, liberación y confirmación; exceso → `429 TOO_MANY_REQUESTS` | Acaparar asientos, fuerza bruta de códigos de reserva y de la clave de admin; rotar `X-Client-Id` no evade el contador por IP | `rate-limits.ts`, controladores | Solo por cliente (se evade generando UUID nuevos); solo por IP (castiga a usuarios detrás de la misma NAT en las acciones de compra); en nginx (no distingue rutas ni clientes) |
| `ADMIN_KEY` comparada con `timingSafeEqual` (sobre hashes de igual longitud) | Ataques de tiempo para adivinar la clave | `admin-key.guard.ts` | Comparación con `===` (filtra información por tiempo) |
| Secretos solo por variables de entorno; `.env` ignorado | Fuga de secretos en el repositorio | `config.ts`, `.gitignore` | Valores por defecto en el código |
| Tarjeta solo en memoria; se guardan marca y últimos 4 | Robo de datos de pago desde la base o los logs | `PaymentGateway`, `bookings.card_brand`, `bookings.card_last4` | Guardar el número cifrado (innecesario: no hay cobros posteriores) |
| pino con `redact` de `X-Admin-Key`, `X-Client-Id`, `authorization` y datos de tarjeta; `holderTag` como contexto | Fuga de credenciales y datos personales en logs | `logger.module.ts` | Logs sin redact o con el `clientId` en claro |
| Prisma con consultas parametrizadas; SQL crudo solo con tagged templates (`$queryRaw`, `Prisma.sql`) | Inyección SQL | adaptadores Prisma | `$queryRawUnsafe` o concatenación |
| Handshake del socket valida el `clientId`; el cliente solo puede unirse o salir de rooms | Suplantación en tiempo real y eventos de estado falsificados | `socket-handshake.ts`, `realtime.gateway.ts` | Aceptar conexiones anónimas o comandos por socket |
| Frontend sin `innerHTML` ni `bypassSecurityTrust*` (regla de ESLint y verificación de plantillas) | XSS | `eslint.config.mjs`, `scripts/check-templates.mjs` | Confiar en la revisión manual |
| Errores sin stack, SQL ni detalles internos | Reconocimiento por parte de un atacante | `ApiExceptionFilter` | Devolver el mensaje original de la excepción |
| Mismo 404 para código o correo incorrecto en la consulta del boleto | Enumeración de reservas | `LookupBookingUseCase` | Mensajes distintos por campo |
| `holderTag` en vez del `clientId` en eventos y snapshots (§15) | Suplantación del cliente anónimo | `holderTagOf`, gateway | Difundir el `clientId` |

**Límites de solicitudes** (revisión analyze, 1.1.0). Dos contadores con nombre: `ip` (siempre) y
`client` (`X-Client-Id` válido). En la consulta del boleto y en admin solo cuenta la IP, porque el
`X-Client-Id` lo elige el atacante y rotarlo evadiría el límite. Todos los valores se multiplican
por `RATE_LIMIT_MULTIPLIER`, que el arnés e2e sube salvo en las pruebas de límites:

| Ruta | Por cliente | Por IP |
|------|-------------|--------|
| `POST`/`DELETE …/hold` | 20 cada 10 s | 200 cada 10 s (deja pasar la prueba de 100 bloqueos simultáneos) |
| `POST /api/bookings` | 5 por minuto | 30 por minuto |
| `POST /api/bookings/lookup` | — | 10 por minuto |
| `PATCH /api/admin/flights/:id/status` | — | 20 por minuto |
| Resto de la API (salvo `/health`) | — | 300 por minuto |

**Razón**: constitución 1.1.0, principio X. Son medidas baratas que cubren las amenazas
habituales de una API pública sin autenticación real.

**Alternativas descartadas**: autenticación real (fuera de alcance, principio VII); WAF o API
gateway externo (infraestructura extra para un prototipo).
