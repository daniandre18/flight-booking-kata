# Manual de la demo: guion para la sustentación

Recorrido paso a paso por todas las funcionalidades, con lo que hay que hacer, lo que se debe
ver y lo que conviene explicar en cada paso. Está pensado para una sustentación de 30 minutos.

En cada paso:

- **Haz**: la acción en pantalla o en la terminal.
- **Verás**: el resultado esperado.
- **Explica**: el mensaje técnico que defiende la decisión, con el archivo donde está.

---

## 0. Preparación (10 minutos antes)

### 0.1 Levantar todo

```bash
cd flight-booking-kata
docker compose up --build -d     # db + api + web
pnpm seed                        # regenera los datos con la fecha de HOY (los vuelos cubren 7 días)
curl -s localhost:8080/health    # → {"status":"ok","db":"up"}
```

> `pnpm seed` borra y regenera los datos de prueba. Hazlo el mismo día de la exposición: los
> vuelos se generan desde la fecha en que corre el seed. El log imprime el vuelo casi lleno y
> una reserva de ejemplo.

### 0.2 Ventanas

| Ventana      | Cómo abrirla                                   | Para qué                                                     |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------ |
| **A**        | Chrome normal → <http://localhost:8080>        | Cliente 1                                                    |
| **B**        | Chrome **incógnito** → <http://localhost:8080> | Cliente 2: otro `clientId`, porque tiene otro `localStorage` |
| **Terminal** | En la raíz del repo                            | Pruebas, `curl` y logs                                       |

Pon A y B lado a lado: el efecto en vivo es lo que más impacta.

### 0.3 Datos de referencia

| Dato                     | Valor                                                                             |
| ------------------------ | --------------------------------------------------------------------------------- |
| Ruta de la demo          | **BOG → MDE**, fecha de **mañana**                                                |
| Vuelos de esa ruta y día | KT1000 06:00 (**1 asiento libre: 30F**), KT1001 12:30 y KT1002 18:45 (180 libres) |
| Tarjeta aprobada         | `4111 1111 1111 1111`, vencimiento `12/30`, CVV `123`                             |
| Tarjeta rechazada        | `4000 0000 0000 0002` (siempre da 402)                                            |
| Clave de admin           | `demo-admin-key`                                                                  |
| Reserva de ejemplo       | código `KR19EX`, correo `demo1@example.com`                                       |
| Id de un vuelo           | está en la URL del mapa o del tablero: `/flights/<id>/seats`                      |

---

## 1. Guion sugerido (30 minutos)

| Minuto | Bloque              | Contenido                                                                                                               |
| -----: | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
|    0–3 | Contexto            | Problema (doble reserva y tiempo real) y solución en una frase: "PostgreSQL decide, Socket.io avisa después del commit" |
|    3–7 | Arquitectura        | Diagrama del README: monolito modular hexagonal, `@kata/shared` y comandos REST frente a eventos por socket             |
|   7–11 | HU1 Búsqueda        | §2                                                                                                                      |
|  11–17 | HU2 Bloqueo en vivo | §3: el corazón de la demo                                                                                               |
|  17–21 | HU3 Pago y boleto   | §4                                                                                                                      |
|  21–25 | HU4 Tablero y admin | §5 y §6                                                                                                                 |
|  25–28 | Pruebas y calidad   | §8: concurrencia 100 → 1, cobertura y Playwright                                                                        |
|  28–30 | IA y cierre         | `docs/ia.md`: flujo Spec Kit y el bug que encontraron las e2e (C2)                                                      |

Si el tiempo se acorta, prioriza §3 (bloqueo en vivo), §8.1 (concurrencia) y §5 (tablero).

---

## 2. Historia 1: búsqueda de vuelos con cambios en vivo

### 2.1 Buscar

- **Haz** (ventana A): en **Buscar vuelos**, elige Origen **Bogotá (BOG)**, Destino
  **Medellín (MDE)**, la fecha de mañana, y pulsa **Buscar vuelos**.
- **Verás**: los 3 vuelos del día ordenados por salida. Cada uno muestra:
  - hora de salida → hora de llegada;
  - número de vuelo, duración y tarifa en pesos;
  - estado con texto ("Programado") y "N de 180 asientos disponibles";
  - los botones **Elegir asientos** y **Ver ocupación**.
- **Explica**:
  - El formulario valida con **el mismo esquema zod** que el backend
    (`createSearchFlightsQuerySchema` en `@kata/shared`): DRY y sin duplicar reglas.
  - "Mañana" se calcula en **hora de Bogotá** (`bogotaDayRange`): un vuelo que sale a las
    23:30 sigue siendo del mismo día.
  - La consulta queda en la URL: se puede recargar o compartir.

### 2.2 Validaciones

- **Haz**: pon Origen = Destino, o una fecha pasada, y pulsa Buscar.
- **Verás**: el error junto al campo ("El destino debe ser distinto del origen", "La fecha no
  puede ser pasada"). No se envía la búsqueda.
- **Explica**: el backend aplica la misma regla y respondería `422 VALIDATION_ERROR`. El
  reloj del backend está inyectado (`Clock`), así que en las pruebas se controla con
  `FakeClock`.

### 2.3 Cambio de estado en vivo (lo verás de nuevo en §6)

- **Haz**: deja la búsqueda abierta en A. En §6 vas a retrasar y cancelar un vuelo desde B.
- **Verás**: en A, el resultado cambia **sin recargar**: "Retrasado" con "Nueva salida: … (antes
  …)", y luego "Cancelado" con su aviso y sin el botón Elegir asientos.
- **Explica**: la búsqueda escucha el room `search` (`flight:stats`). Aplica un resumen solo si
  `seq === última + 1`. Ante un salto pide `GET /api/flights/:id`, agrupando los pedidos en
  250 ms (`search-results.store.ts`).

---

## 3. Historia 2: selección y bloqueo temporal de asientos (el núcleo)

### 3.1 Abrir el mismo vuelo en las dos ventanas

- **Haz**: en A y en B, abre **KT1001** con **Elegir asientos**.
- **Verás**:
  - el **fuselaje** de un avión: la nariz redondeada con la cabina de mando, "▲ Frente del
    avión", ventanillas a los lados, filas 1 a 30 numeradas a ambos lados y
    A B C · pasillo · D E F;
  - letreros verdes de **salida**: puertas delanteras, **salida de emergencia sobre el ala**
    (filas 12 y 13, con el número en verde) y puertas traseras; también **baños** adelante y
    atrás;
  - cada asiento es un **asiento real en SVG** (respaldo, cabecero, cojín y apoyabrazos):
    gris claro si está disponible;
  - la leyenda de los 5 estados con el mismo asiento, cada uno con color **y** con una marca
    (✓, reloj, ✕ o guion), más los letreros;
  - el panel "Tu selección" a la derecha;
  - el badge **Conectado** arriba.
- **Explica** (diseño): el asiento es un SVG decorativo dentro de un `<button>` real. La
  accesibilidad no cambia: el botón conserva su `aria-label` ("Asiento 12C, pasillo,
  disponible"), el roving tabindex y el foco visible. El tooltip agrega "fila de salida de
  emergencia" en las filas 12 y 13.
- **Explica**: al entrar, la página hace `flight:join` y luego pide el snapshot
  `GET /api/flights/:id/seats`. Los eventos que llegan mientras tanto se guardan y se aplican
  después, en orden de `seq` (`flight-room-sync.ts`).

### 3.2 Bloquear y verlo en la otra ventana

- **Haz** (A): clic en **12C**.
- **Verás**:
  - **En A**: 12C en **azul vibrante con brillo** y ✓ ("seleccionado por ti"). El panel muestra 12C, el precio, el
    total y la cuenta regresiva **10:00**.
  - **En B**: 12C cambia **al instante** a "bloqueado por otra persona" (ámbar con un reloj),
    con un destello breve que no te quita el foco.
- **Explica** la secuencia del backend (`hold-seat.use-case.ts`):
  1. Lock de la **fila del vuelo** (UPDATE condicional: el vuelo debe ser reservable).
  2. `pg_advisory_xact_lock` del cliente en ese vuelo, para el límite de 4 y el reloj
     compartido.
  3. `UPDATE seats ... WHERE status = 'AVAILABLE' OR (HELD vencido)`: **si afecta 1 fila,
     ganas; si afecta 0, es 409**. Nunca se hace SELECT y luego UPDATE.
  4. Se registra el evento con su `seq` y se hace **commit**. Solo después se publica
     `seat:held`.
- **Dato medido**: entre dos pestañas de Chrome tarda de 18 a 51 ms; entre clientes, p95 de
  13,9 ms.

### 3.3 Reloj compartido

- **Haz** (A): espera unos segundos y bloquea **12D**.
- **Verás**: el panel suma 12D y la cuenta regresiva **no se reinicia**: es la misma.
- **Explica**: el vencimiento es único por cliente y vuelo (`computeHoldExpiry` en
  `hold-policy.ts`). Sumar asientos nunca alarga el plazo; así se evita acaparar asientos
  indefinidamente.

### 3.4 Límite de 4

- **Haz** (A): bloquea 2 asientos más (ya tienes 4) e intenta un quinto.
- **Verás**: el toast "Ya tienes 4 asientos bloqueados en este vuelo. Libera uno o continúa al
  pago." El asiento vuelve a disponible.
- **Explica**: el backend responde `422 HOLD_LIMIT_REACHED`. El frontend marca el asiento de
  forma optimista, lo **revierte** al recibir el error y traduce el código con el **único mapa
  de mensajes** (`error-messages.ts`).

### 3.5 Liberar

- **Haz** (A): clic de nuevo en 12C, o **Quitar** en el panel.
- **Verás**: 12C queda disponible en A y en B al instante.
- **Explica**: `DELETE …/hold` hace un UPDATE condicional "solo si es tuyo y está vigente". Si
  no es tuyo responde `409 SEAT_NOT_HELD`, y el evento lleva `reason: MANUAL`.

### 3.6 Recargar y recuperar

- **Haz** (A): recarga la página (F5).
- **Verás**: tus asientos siguen marcados como tuyos y la cuenta regresiva continúa en el tiempo
  real restante.
- **Explica**: `GET /api/clients/me/holds?flightId=` devuelve tus bloqueos y tu `holderTag`.
  El `clientId` vive en `localStorage` y viaja en el header `X-Client-Id`.
  - **Privacidad**: a los demás solo les llega el `holderTag`, un hash SHA-256 truncado; nunca
    el `clientId`.

### 3.7 Teclado y lector de pantalla (accesibilidad)

- **Haz**: con Tab entra al mapa, muévete con las **flechas** y pulsa **Enter** o **Espacio**.
- **Verás**: un solo asiento en el orden de tabulación (roving tabindex), foco visible y
  bloqueo con el teclado.
- **Explica**: cada botón tiene un `aria-label` como "Asiento 12C, pasillo, disponible", y el
  tooltip muestra el código, el tipo, el precio y el estado. Todos los contrastes son ≥ 4,5:1,
  medidos con la fórmula WCAG (`tokens.css`). Hay una región `aria-live` para anunciar los
  cambios.

### 3.8 "¿Y si dos hacen clic a la vez?"

- **Haz**: intenta en B hacer clic sobre un asiento que A acaba de bloquear.
- **Verás**: no deja: el asiento ya aparece bloqueado por otra persona y está deshabilitado.
- **Explica**:
  - La carrera real la resuelve la base, no la interfaz.
  - Si los dos clics llegan a la vez, uno recibe 201 y el otro **409** ("Este asiento ya no
    está disponible. Elige otro asiento del mapa."), y su interfaz se revierte.
  - Se demuestra en §8.1 (100 solicitudes) y con la prueba de Playwright de clic simultáneo
    (§8.3).

### 3.9 Vencimiento del bloqueo (demo rápida, opcional)

- **Haz** (terminal):
  ```bash
  HOLD_TTL_SECONDS=60 docker compose up -d api   # bloqueos de 1 minuto
  ```
  Luego, en A, bloquea un asiento y espera.
- **Verás**:
  - Con 60 s o menos, la cuenta regresiva se pone roja y aparece "Queda menos de 1 minuto para
    pagar."
  - En 00:00, el panel dice "Tu tiempo terminó y los asientos se liberaron…".
  - En B, el asiento vuelve a disponible en unos 2 s.
- **Explica**:
  - **Vista perezosa**: un bloqueo vencido ya cuenta como libre en cualquier consulta o
    `UPDATE`.
  - **Barrido cada 2 s** (`HoldSweeperJob`): solo libera y **notifica** `seat:released` con
    `EXPIRED`. Medido: entre 1,0 y 2,0 s; la meta es ≤ 5 s.
- **Al terminar**: `docker compose up -d api` (vuelve a 10 minutos).

### 3.10 Reconexión (opcional, pero impresiona)

- **Haz** (terminal), con el mapa abierto en A: `docker compose restart api`.
- **Verás**:
  - El badge pasa a **Reconectando…** y aparece "Actualizando el mapa… las acciones se
    reactivan en un momento". Los clics quedan deshabilitados.
  - Unos 4 s después vuelve **Conectado** con el estado al día. Medido: el snapshot llega
    0,1 s después de reconectar.
  - Tus bloqueos **sobreviven** al reinicio.
- **Explica**: al reconectar, `RealtimeService` vuelve a unirse a los rooms y el store pide el
  snapshot antes de permitir acciones. Los eventos que el cliente se perdió no importan: el
  snapshot trae el estado y la `seq`.

---

## 4. Historia 3: confirmación y boleto

### 4.1 Pago rechazado

- **Haz** (A): con asientos bloqueados, pulsa **Continuar al pago**. Completa los datos del
  comprador, un nombre por asiento (cada campo dice "Pasajero del asiento 12D") y la tarjeta
  `4000 0000 0000 0002`. Pulsa **Pagar**.
- **Verás**:
  - mientras escribes el número, la marca detectada ("Marca: VISA");
  - después de pagar, "El pago fue rechazado. Tus asientos siguen bloqueados: prueba con otra
    tarjeta.";
  - lo que escribiste **se conserva** y la cuenta regresiva sigue.
- **Explica**: `402 PAYMENT_DECLINED`. Toda la confirmación es **una transacción**: si el pago
  falla, se hace rollback y los bloqueos quedan intactos (`confirm-booking.use-case.ts`).

### 4.2 Pago aprobado

- **Haz**: cambia la tarjeta a `4111 1111 1111 1111` y pulsa **Pagar**. Si quieres, haz
  **doble clic**.
- **Verás**:
  - el botón cambia a "Procesando el pago…" y se deshabilita;
  - luego, **Tu boleto**: el código destacado de 6 caracteres, el vuelo, los asientos con su
    pasajero, el total y "Pagado con VISA terminada en 1111";
  - en B, esos asientos pasan a **reservado** (gris oscuro tachado con ✕).
- **Explica**:
  - **Idempotencia**: la página genera una `Idempotency-Key` al abrir el pago y la reutiliza
    en cada reintento. El backend guarda `(cliente, clave, hash del cuerpo)`:
    - la misma clave devuelve **la misma reserva** (`200` + `Idempotent-Replayed: true`);
    - la misma clave con otro cuerpo da `422`;
    - dos envíos simultáneos producen **una sola** reserva (lo prueba la e2e).
  - **Datos de tarjeta**: solo se guardan la marca y los últimos 4. El número vive en memoria
    durante el cobro y nunca va a los logs.
  - Pasar de `HELD` a `BOOKED` es otro UPDATE condicional ("solo si siguen siendo tuyos y
    vigentes"). Si vencieron, responde `410 HOLD_EXPIRED`.

### 4.3 Consultar el boleto

- **Haz**: ve a **Consultar boleto** en el menú e ingresa el código y el correo. Prueba el
  correo en mayúsculas y luego un correo incorrecto.
- **Verás**: con los datos correctos aparece el boleto. Con otro correo, "No encontramos una
  reserva con ese código y correo…", el mismo mensaje que con un código que no existe.
- **Explica**: así se evita la **enumeración** de reservas, y el endpoint tiene un límite de
  10 consultas por minuto por IP.

### 4.4 AGOTADO

- **Haz**: busca BOG → MDE de mañana, abre **KT1000** (1 asiento libre), bloquea **30F** y
  págalo.
- **Verás**: en la búsqueda abierta en la otra ventana, KT1000 pasa a **Agotado**, con
  "0 de 180" y el aviso "Este vuelo se agotó". El mapa queda deshabilitado con su motivo.
- **Explica**: en la misma transacción, `markSoldOutIfFull` hace un UPDATE condicional
  ("ningún asiento sin reservar"), y luego se emite `flight:updated` con `change: SOLD_OUT`.

---

## 5. Historia 4: tablero de ocupación en vivo

- **Haz**: en la búsqueda, **Ver ocupación** de KT1001 (o `/flights/<id>/dashboard`). Desde la
  otra ventana, bloquea, libera y reserva asientos de ese vuelo.
- **Verás**:
  - las tarjetas **Disponibles / Bloqueados / Reservados / Ocupación**, que **siempre suman
    180**;
  - una barra proporcional;
  - el **registro de actividad** con la hora, el tipo (bloqueo, liberación, vencimiento,
    reserva, cambio de estado del vuelo) y el asiento;
  - todo se actualiza al instante, sin recargar.
- **Explica**:
  - El tablero usa **el mismo reductor y la misma sincronización** que el mapa (DRY,
    `core/flight-state/`).
  - Los contadores se **derivan** del estado de los asientos: no hay un contador aparte que
    pueda desincronizarse.
  - El registro sale de la tabla `flight_events`, que guarda cada evento con su `seq` (los
    últimos 50).
  - Requisito del reto: "reaccionar a cada bloqueo, liberación por tiempo expirado o reserva
    al instante".

---

## 6. Administración: retraso y cancelación

### 6.1 Clave incorrecta

- **Haz**: ve a **Administración**. Pega el id de **KT1002** (cópialo de la URL de su mapa o
  tablero), elige **Cancelar**, escribe una clave incorrecta y pulsa **Cancelar vuelo**.
- **Verás**: "La clave de administrador no es correcta. Revísala e intenta de nuevo."
- **Explica**: `401 ADMIN_UNAUTHORIZED`. La clave se compara en **tiempo constante**
  (`timingSafeEqual` sobre SHA-256), y el endpoint tiene un límite por IP. La clave se guarda
  solo en el `sessionStorage` de la pestaña.

### 6.2 Retrasar

- **Haz**: clave `demo-admin-key`, **Retrasar** y una nueva hora posterior a la salida actual
  (hora de Bogotá). Pulsa **Retrasar vuelo**.
- **Verás**: "Listo: el vuelo KT1002 quedó retrasado." En la búsqueda abierta (§2.3), KT1002
  aparece **Retrasado** con "Nueva salida: … (antes …)", sin recargar.
- **Explica**: las reglas de transición viven en el dominio puro (`delayFlight` en
  `flights/domain/flight.ts`):
  - la salida y la llegada se desplazan lo mismo;
  - una hora no posterior a la salida da `422 INVALID_DELAY`;
  - un vuelo AGOTADO **conserva** su estado.

### 6.3 Cancelar (con bloqueos activos)

- **Haz**: en otra ventana, abre el mapa de KT1002 y bloquea 2 asientos. En Administración,
  **Cancelar vuelo**.
- **Verás**:
  - en el mapa, el aviso "Este vuelo fue cancelado…", los asientos liberados y el mapa
    deshabilitado; si tenías bloqueos, un toast lo avisa;
  - en la búsqueda, **Cancelado** sin botón de selección.
- **Explica**: una sola transacción (`change-flight-status.use-case.ts`):
  1. lock del vuelo;
  2. `status = CANCELLED`;
  3. **liberación de todos los HELD**, con `reason: FLIGHT_CANCELLED`;
  4. eventos y commit.

  Después del commit, cualquier bloqueo o confirmación da `422 FLIGHT_NOT_BOOKABLE`. Cancelar
  dos veces da `422 FLIGHT_STATUS_CONFLICT`. Gracias al orden de locks no hay carrera entre
  cancelar y bloquear.

---

## 7. Seguridad (si preguntan, o en 1 minuto)

| Muestra                                                                            | Cómo                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toda entrada validada con zod (body, query, params, headers y payloads del socket) | `curl -s "localhost:8080/api/flights?origin=XXX&destination=MDE&date=2030-01-01"` → `422` con detalle por campo                                                                                                                                                                               |
| `X-Client-Id` UUID v4 obligatorio                                                  | `curl -s -X POST -H "X-Client-Id: hola" localhost:8080/api/flights/<id>/seats/1A/hold` → `400 CLIENT_ID_REQUIRED`                                                                                                                                                                             |
| Límite de solicitudes (429)                                                        | 11 consultas seguidas: `for i in $(seq 11); do curl -s -o /dev/null -w "%{http_code} " -X POST -H 'Content-Type: application/json' -d '{"code":"ABC123","email":"a@b.co"}' localhost:8080/api/bookings/lookup; done` → diez `404` y luego `429`. Bloquea la consulta 1 minuto: hazlo al final |
| Logs sin secretos                                                                  | `docker compose logs api \| grep -o '"x-client-id":"[^"]*"' \| head -3` → `[redactado]`                                                                                                                                                                                                       |
| Errores sin stack ni SQL                                                           | Cualquier error responde `{ code, message, details }`                                                                                                                                                                                                                                         |
| Sin `innerHTML` en el frontend                                                     | `pnpm lint` revisa las 49 plantillas                                                                                                                                                                                                                                                          |

---

## 8. Pruebas y calidad (en la terminal)

### 8.1 La prueba de concurrencia (la más importante)

```bash
pnpm --filter backend test:e2e hold-concurrency
```

- **Verás**: `[medición] 100 bloqueos simultáneos: 1 × 201, 99 × 409, 0 × 5xx en ~160 ms`.
- **Explica**: 100 clientes distintos atacan el mismo asiento contra un **PostgreSQL 16 real**
  (Testcontainers). Exactamente uno gana; en la base queda un solo `HELD` y un solo evento.

### 8.2 Todo el resto

```bash
pnpm test        # 356 pruebas: shared, unitarias del backend, e2e contra PostgreSQL y frontend (1–2 min)
pnpm test:cov    # cobertura: dominio y aplicación del backend 99,8 % de líneas y 96,5 % de ramas
```

### 8.3 Dos pestañas reales (Playwright)

```bash
pnpm test:e2e:ui   # con el stack levantado; usa tu Chrome
```

Prueba dos cosas: que el bloqueo se ve en la otra pestaña en menos de 1 s, y que en un clic
simultáneo gana exactamente una.

### 8.4 Tiempos

```bash
node scripts/measure-realtime.mjs <flightId>
```

Mide la propagación entre clientes, el retraso hasta la búsqueda y la reconexión con snapshot.

---

## 9. Preguntas probables y respuestas cortas

| Pregunta                                      | Respuesta                                                                                                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Por qué monolito y no microservicios?        | La integridad exige una sola transacción: confirmar y cancelar tocan asientos, reservas y vuelo. Con microservicios serían sagas. Los módulos ya tienen fronteras (puertos, `index.ts`), así que separar un servicio después es posible                   |
| ¿Cómo evitas la doble reserva?                | Un `UPDATE` condicional cuyo conteo decide. Además, el lock del vuelo con orden fijo (vuelo → cliente → asiento) y `UNIQUE(seat_id)` en `booking_seats` como última defensa. Probado con 100 solicitudes concurrentes                                     |
| ¿Por qué no Redis para los bloqueos?          | Sería una segunda fuente de verdad que mantener sincronizada con la reserva. PostgreSQL ya da atomicidad y transacciones; a esta escala no hace falta                                                                                                     |
| ¿Por qué Socket.io y no SSE?                  | Rooms por vuelo, reconexión automática con re-join y transporte de respaldo. SSE no tiene rooms y obliga a reimplementar las suscripciones                                                                                                                |
| ¿Qué pasa si se pierde un evento?             | Cada evento lleva una `seq` consecutiva por vuelo. El cliente detecta el hueco y pide el snapshot; al reconectar, también                                                                                                                                 |
| ¿Por qué publicar después del commit?         | Para no anunciar un estado que se pueda revertir (rollback). Si el proceso cae justo entre el commit y la publicación, el hueco de `seq` lo corrige                                                                                                       |
| ¿Qué pasa si se cae el servidor con bloqueos? | Los vigentes siguen (están en la base). Los que vencieron durante la caída se liberan en la pasada de arranque, antes de aceptar tráfico                                                                                                                  |
| ¿Cómo pruebas el tiempo?                      | El puerto `Clock` está inyectado: `FakeClock` en las unitarias y e2e, y `:now` como parámetro en el SQL. Nunca `new Date()` en el dominio                                                                                                                 |
| ¿Cómo se ve SOLID en el código?               | Tabla "SOLID y DRY en el código" de `docs/architecture.md`, con un archivo por letra                                                                                                                                                                      |
| ¿Cómo usaste la IA y qué corregiste?          | Spec Kit (constitución → spec → plan → tareas → analyze → implement por bloques). Ejemplo fuerte: un bug real del gateway (`@OnEvent` con arreglo no difundía nada) que pasaba las unitarias y lo encontró la e2e. Ver `docs/ia-log.md` (18 correcciones) |
| ¿Qué mejorarías?                              | Outbox para no depender del snapshot ante una caída entre commit y publicación; compilar `@kata/shared` también a ESM para bajar el bundle; `trust proxy` para que el límite por IP distinga a cada cliente detrás de nginx (§10)                         |

---

## 10. Si algo falla

| Síntoma                                               | Solución                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| No hay vuelos para mañana                             | Corre `pnpm seed` (regenera desde hoy)                                               |
| Puerto 5432, 3000 u 8080 ocupado                      | `docker compose down` y vuelve a levantar; revisa otros contenedores con `docker ps` |
| El badge dice "Reconectando…" todo el tiempo          | `docker compose ps`, y si la api no está arriba, `docker compose up -d api`          |
| La consulta del boleto responde "Demasiados intentos" | Espera 1 minuto: el límite es de 10 por minuto                                       |
| Quedó la api con bloqueos de 60 s                     | `docker compose up -d api` (vuelve a 600 s)                                          |
| Quiero empezar de cero                                | `pnpm seed` (borra reservas, bloqueos y eventos, y regenera)                         |

> **Límite por IP detrás de nginx**: en `docker compose`, la api ve todas las solicitudes con la
> IP de nginx, porque Express no confía en `X-Forwarded-For` sin `trust proxy`. Los límites por
> IP de la consulta del boleto y de admin se comparten entre todos los usuarios de la demo. No
> afecta a una exposición con una o dos personas, pero conviene mencionarlo como mejora (§9).
