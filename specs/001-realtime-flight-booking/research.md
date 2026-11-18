# Investigación y decisiones (Fase 0): Reservas de vuelos en tiempo real

**Fecha**: 2026-11-18 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Fuente de las decisiones: [docs/prompts/plan.md](../../docs/prompts/plan.md). Cada entrada
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
`Clock`, `PaymentGateway`, `EventPublisher` y un repositorio por agregado (`FlightRepository`,
`SeatHoldRepository`, `BookingRepository`, `IdempotencyStore`).

**Razón**: principio IV. El dominio decide las reglas (límite de 4, duración del bloqueo, reloj
compartido, transiciones válidas) y se prueba sin infraestructura; las garantías atómicas viven
en el adaptador de persistencia, que expone operaciones de intención (`tryHold`, `release`,
`confirm`, `releaseExpired`, `cancelFlight`) en vez de lecturas y escrituras sueltas.

`admin` y `health` se suman a los cuatro módulos que nombra la constitución: `admin` es un
adaptador HTTP con su caso de uso sobre el dominio de `flights`, y `health` es operativo.

**Alternativas descartadas**: capas por tipo técnico (controllers/, services/) en todo el
backend (mezcla dominios); CQRS con bus de comandos (excesivo para el alcance).

## 4. Persistencia: PostgreSQL + Prisma

**Decisión**: PostgreSQL 16 con Prisma como ORM y migraciones. Tablas: `flights` (con `seq`),
`seats`, `bookings`, `booking_seats`, `idempotency_keys` y `flight_events` (ver
[data-model.md](./data-model.md)). Las sentencias que Prisma no expresa (bloqueo de fila de
vuelo, `UPDATE ... RETURNING`, `pg_advisory_xact_lock`) se escriben con `$queryRaw`
parametrizado dentro de transacciones interactivas (`prisma.$transaction(async tx => ...)`).

**Razón**: la constitución exige PostgreSQL; Prisma da tipado y migraciones sin perder acceso a
SQL para las operaciones atómicas.

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
bloqueando la fila del vuelo con una sentencia condicional que incrementa la secuencia y
verifica a la vez que el vuelo admite la operación, por ejemplo para un bloqueo:
`UPDATE flights SET seq = seq + 1 WHERE id = :id AND status IN ('SCHEDULED','DELAYED') AND
departure_at > :now RETURNING seq`. Sin fila devuelta, la operación responde
`409 FLIGHT_NOT_BOOKABLE`. Si un paso posterior falla, el rollback deshace el incremento, de
modo que la secuencia no tiene huecos. Orden de locks fijo en todas las operaciones:
**vuelo → advisory lock del cliente → asientos**.

**Razón**: sin este paso hay dos defectos:

1. **Carrera con la cancelación**: un bloqueo que verifica el vuelo en una subconsulta puede
   comprometerse justo después de que la cancelación liberó los bloqueos, y dejar un asiento
   bloqueado en un vuelo cancelado. Con el lock del vuelo primero, cancelación y bloqueo se
   serializan.
2. **Interbloqueos y orden de eventos**: si unas operaciones tocan asiento → vuelo y otras
   vuelo → asiento, PostgreSQL puede abortar una por interbloqueo. Un orden único lo evita.
   Además, el lock de fila garantiza que el orden de `seq` coincide con el orden de commit.

El costo es serializar las escrituras de un mismo vuelo; con 180 asientos y transacciones de
milisegundos no afecta los objetivos (100 bloqueos simultáneos terminan en menos de 1 s).

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

**Decisión**: una transacción que:

1. Inserta la clave de idempotencia (decisión 10).
2. Bloquea la fila del vuelo con la condición `status IN ('SCHEDULED','DELAYED')`; si falla,
   `409 FLIGHT_NOT_BOOKABLE` (por ejemplo, vuelo cancelado).
3. Ejecuta el `UPDATE` condicional `HELD → BOOKED WHERE flight_id = :f AND held_by = :c AND
   hold_expires_at > :now AND seat_id IN (:asientos de la solicitud)`.
4. Exige que el conteo sea igual al número de asientos de la solicitud y al número de bloqueos
   vigentes del cliente en el vuelo. Si no coincide: rollback y `410 HOLD_EXPIRED`. Si la
   solicitud omite asientos bloqueados vigentes, `422 PASSENGERS_MISMATCH` (para comprar menos,
   el cliente libera antes los que no quiere).
5. Cobra con el puerto `PaymentGateway`. Si `FakePaymentGateway` rechaza: rollback (los asientos
   siguen `HELD` con su vencimiento original) y `402 PAYMENT_DECLINED`.
6. Inserta `bookings` y `booking_seats` (`UNIQUE(seat_id)` como última defensa).
7. Marca el vuelo `SOLD_OUT` con una sentencia condicional si no quedan asientos sin reservar
   (decisión 14).
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

**Decisión**: un job con `@nestjs/schedule` cada 5 s (`HOLD_SWEEP_INTERVAL_MS`, por defecto
5000) recorre los vuelos con bloqueos vencidos. Por cada vuelo: bloquea la fila del vuelo,
libera con `UPDATE seats ... WHERE status = 'HELD' AND hold_expires_at <= :now RETURNING`,
avanza `seq` y publica `seat:released` con `reason: EXPIRED`. Al arrancar, el job corre una
vez antes de aceptar tráfico. Además, toda operación trata un bloqueo vencido como disponible
(verificación perezosa): el `UPDATE` de bloqueo lo acepta, la confirmación lo rechaza, y el
snapshot y las estadísticas lo cuentan como disponible.

**Razón**: la corrección no depende del job; el job solo existe para notificar a tiempo
(RF-012) y limpiar tras un reinicio (RF-032).

**Riesgo anotado**: con un intervalo de 5 s, un bloqueo que vence justo después de una pasada
se notifica a los 5 s más el tiempo de la transacción, apenas por encima del máximo de CE-003.
El intervalo es configurable; bajarlo a 2–3 s da margen. Se mantiene 5 s por decisión del
documento fuente hasta que se confirme el cambio.

**Alternativas descartadas**: un temporizador por bloqueo en memoria (se pierde al reiniciar,
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
traduce a Socket.io. Cada transacción emite además un único `flight:stats` con la `seq` del
último evento.

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
- **Retraso** **(refinamiento)**: `flights` guarda `scheduled_departure_at` (original) y
  `departure_at` / `arrival_at` (vigentes). El retraso exige `newDepartureAt > departure_at`
  (si no, `422 INVALID_DELAY`) y desplaza la llegada lo mismo. El estado pasa a `DELAYED`,
  salvo si el vuelo está `SOLD_OUT`, que conserva su estado; el retraso se deduce de
  `departure_at > scheduled_departure_at`. La búsqueda usa `departure_at`, así que un retraso
  que cambia de día mueve el vuelo a los resultados de la nueva fecha.
- **Cancelación**: transacción que bloquea el vuelo con `status <> 'CANCELLED'` (si no,
  `409 FLIGHT_STATUS_CONFLICT`), pasa a `CANCELLED`, libera todos los bloqueos con `RETURNING`,
  y emite `seat:released` (`reason: FLIGHT_CANCELLED`) por asiento y `flight:updated`. Las
  reservas existentes se conservan.

**Razón**: cubre los supuestos de la spec (AGOTADO solo por reservas, AGOTADO retrasado sigue
sin admitir bloqueos, CANCELADO final) con sentencias atómicas.

**Alternativas descartadas**: un enum que combine estados (por ejemplo, `SOLD_OUT_DELAYED`;
explota combinaciones); calcular AGOTADO al leer (la spec pide notificar el cambio).

## 15. Identidad anónima y privacidad del dueño del bloqueo **(refinamiento)**

**Decisión**: el `clientId` es un UUID v4 que el frontend genera y guarda en `localStorage`
(`ClientIdService`). Se envía en el header `X-Client-Id` (obligatorio en bloqueos, reservas y
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
cliente: `seat:held`, `seat:released`, `seat:booked`, `flight:updated`, `flight:stats`. Al room
`search` se envían `flight:updated` y `flight:stats` de todos los vuelos, y el frontend filtra
por los vuelos listados. Catálogo completo en
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
| 409 | Conflicto de estado del asiento o del vuelo | `SEAT_UNAVAILABLE`, `SEAT_NOT_HELD`, `FLIGHT_NOT_BOOKABLE`, `FLIGHT_STATUS_CONFLICT` |
| 410 | Bloqueo expirado | `HOLD_EXPIRED` |
| 422 | Validación de esquema o de negocio | `VALIDATION_ERROR`, `HOLD_LIMIT_REACHED`, `PASSENGERS_MISMATCH`, `INVALID_DELAY`, `IDEMPOTENCY_KEY_REUSED` |

Los errores de zod se devuelven como `422 VALIDATION_ERROR` con la lista de campos en
`details` (nestjs-zod responde 400 por defecto; el filtro lo ajusta). La clave de administrador
se compara en tiempo constante (`timingSafeEqual`).

**Razón**: principio VI. El 401 es una adición justificada en el Constitution Check.

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
- **Estado del mapa**: un reductor puro aplica solo eventos con `seq` mayor al último visto. Al
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
- **Layout**: panel de resumen sticky a la derecha (abajo en móvil) con asientos, total y barra
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
- **Backend, e2e**: Jest + Supertest contra PostgreSQL real con Testcontainers; si existe
  `TEST_DATABASE_URL` se usa esa base (por ejemplo, el contenedor de docker compose). Casos
  obligatorios: 100 `POST /hold` en paralelo al mismo asiento con `clientId` distintos dan
  exactamente 1 respuesta 201 y 99 respuestas 409; reloj compartido; bloqueo vencido da 410 al
  confirmar; idempotencia; cancelación con bloqueos activos; clave de admin incorrecta da 401;
  lookup con correo incorrecto da 404; además, el límite de 4 y el pago rechazado conservan los
  bloqueos.
- **Frontend**: runner por defecto del Angular CLI; pruebas de `RealtimeService` y del reductor
  del mapa con eventos desordenados, duplicados y con huecos.
- **Opcional**: Playwright con dos contextos de navegador para la prueba de dos pestañas.

**Razón**: principio V. La prueba de concurrencia solo es válida contra PostgreSQL real.

**Alternativas descartadas**: SQLite o una base en memoria (no reproduce el bloqueo de filas);
mocks del repositorio para concurrencia (no prueban nada).

## 21. Despliegue local

**Decisión**: `docker compose up` levanta `postgres:16` (con healthcheck), `api` (aplica
`prisma migrate deploy`, ejecuta el seed si la base está vacía y arranca) y `web` (build de
Angular servido por nginx, que hace de proxy para `/api` y `/socket.io` con soporte de
upgrade). Variables: `DATABASE_URL`, `ADMIN_KEY`, `HOLD_TTL_SECONDS`, `HOLD_SWEEP_INTERVAL_MS`,
`PORT`, `LOG_LEVEL`.

**Razón**: CE-004 y principio VII: un solo comando, mismo origen (sin CORS).

**Alternativas descartadas**: servir Angular desde NestJS (acopla los despliegues); `ng serve`
en el contenedor (no es un build de producción).

## 22. Datos de prueba

**Decisión**: el seed es determinista. Usa un PRNG con semilla fija y fechas relativas a "hoy"
en Bogotá. Crea los 5 aeropuertos y las 20 rutas dirigidas entre BOG, MDE, CLO, CTG y BAQ, con
3 vuelos diarios por ruta durante 7 días (420 vuelos), cada uno con 180 asientos (30 × 6). Los
identificadores son deterministas (UUID v5 a partir del número de vuelo y la fecha). Para
probar AGOTADO y el tablero incluye un vuelo casi lleno (1 asiento libre). Volver a ejecutarlo
borra y regenera.

**Razón**: "seeds reproducibles" (principio VIII) y datos útiles para demostrar cada historia.

**Alternativas descartadas**: datos aleatorios por ejecución (no reproducibles); fechas fijas
(caducan).

## 23. Calidad y observabilidad

**Decisión**: ESLint + Prettier compartidos desde la raíz, sin `any` (regla
`@typescript-eslint/no-explicit-any` como error). Logs JSON con pino (nestjs-pino) que incluyen
`flightId`, `seatId` y `clientId` cuando aplica (nunca datos de tarjeta). `GET /api/health`
verifica la base con `SELECT 1`. Commits con Conventional Commits.

**Razón**: principio VIII.

**Alternativas descartadas**: winston (más lento y configuración más verbosa); métricas o
tracing (fuera del alcance del prototipo).
