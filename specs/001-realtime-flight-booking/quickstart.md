# Guía rápida y validación: Reservas de vuelos en tiempo real

**Plan**: [plan.md](./plan.md) | **Contratos**: [openapi.yaml](./contracts/openapi.yaml),
[realtime-events.md](./contracts/realtime-events.md) | **Modelo**: [data-model.md](./data-model.md)

Guía para levantar el sistema y comprobar de punta a punta que la funcionalidad cumple la spec.
No contiene código de implementación.

## Requisitos previos

- Docker con Docker Compose v2.
- Para desarrollo local sin Docker: Node.js LTS (versión fijada en `.nvmrc`), pnpm (versión
  fijada en `packageManager` de `package.json`) y PostgreSQL 16.
- Puertos libres: `8080` (web), `3000` (api), `5432` (postgres).

## Variables de entorno

Plantilla en `.env.example` (raíz). Valores por defecto para la demo:

| Variable | Defecto | Uso |
|----------|---------|-----|
| `DATABASE_URL` | `postgresql://kata:kata@postgres:5432/kata` | Conexión de la api |
| `ADMIN_KEY` | `demo-admin-key` | Clave para retrasar o cancelar vuelos (cámbiala fuera de la demo) |
| `HOLD_TTL_SECONDS` | `600` | Duración del bloqueo compartido |
| `HOLD_SWEEP_INTERVAL_MS` | `5000` | Intervalo del job de expiración |
| `PORT` | `3000` | Puerto de la api |
| `LOG_LEVEL` | `info` | Nivel de logs JSON |

## Levantar todo (un comando, CE-004)

```bash
docker compose up --build
```

Resultado esperado:

1. `postgres` queda sano (healthcheck).
2. `api` aplica las migraciones, carga el seed si la base está vacía, ejecuta una pasada del job
   de expiración y escucha en `:3000`.
3. `web` sirve la aplicación en <http://localhost:8080> y hace de proxy para `/api` y
   `/socket.io`.

Verificación: `curl -s localhost:8080/api/health` → `{"status":"ok","db":"up"}`.

## Desarrollo local

```bash
pnpm install
docker compose up -d postgres
pnpm seed          # regenera los datos de prueba (determinista)
pnpm dev           # api en :3000 y web en :4200 con proxy a la api
```

Otros scripts raíz: `pnpm test`, `pnpm lint`, `pnpm build`.

## Pruebas automatizadas

```bash
pnpm test                         # dominio, e2e y frontend
pnpm --filter backend test:e2e    # solo e2e (PostgreSQL real con Testcontainers)
TEST_DATABASE_URL=postgresql://kata:kata@localhost:5432/kata_test pnpm --filter backend test:e2e
                                  # e2e contra una base existente, sin Testcontainers
```

Las pruebas e2e obligatorias (principio V) deben pasar:

| Prueba | Resultado esperado |
|--------|--------------------|
| 100 `POST /hold` en paralelo al mismo asiento (clientes distintos) | Exactamente 1 respuesta `201` y 99 respuestas `409 SEAT_UNAVAILABLE` |
| Reloj compartido | El segundo asiento bloqueado vence a la misma hora que el primero |
| Límite de bloqueos | El quinto bloqueo del mismo cliente en el vuelo da `422 HOLD_LIMIT_REACHED` |
| Expiración (reloj falso) | Tras avanzar el reloj, el job libera el asiento y emite `seat:released` con `EXPIRED` |
| Confirmar con bloqueo vencido | `410 HOLD_EXPIRED` y ninguna reserva creada |
| Pago rechazado (`4000000000000002`) | `402 PAYMENT_DECLINED`; los asientos siguen bloqueados |
| Idempotencia | Dos `POST /bookings` con la misma `Idempotency-Key` → una reserva; la segunda respuesta es `200` con el mismo código |
| Cancelación con bloqueos activos | Bloqueos liberados, `seat:released` con `FLIGHT_CANCELLED`, confirmación posterior `409 FLIGHT_NOT_BOOKABLE` |
| Clave de admin incorrecta | `401 ADMIN_UNAUTHORIZED` |
| Lookup con correo incorrecto | `404 BOOKING_NOT_FOUND`, mismo mensaje que con código inexistente |

## Validación manual por historia

Usa dos ventanas del navegador. Para tener dos clientes distintos, abre la segunda en modo
incógnito (cada una genera su propio `clientId`).

### Historia 1: búsqueda

1. En <http://localhost:8080/search> busca BOG → MDE para mañana.
   **Esperado**: solo vuelos de esa ruta y ese día, ordenados por salida, con tarifa, horas,
   duración, estado y asientos disponibles.
2. Prueba origen igual a destino y una fecha pasada. **Esperado**: error junto al campo, no se
   busca.
3. Desde la ventana 2, cancela uno de los vuelos listados (ver Historia 4).
   **Esperado**: en la ventana 1 aparece CANCELADO con aviso en menos de 1 s y no deja elegir
   asientos.

### Historia 2: bloqueo

1. Abre el mismo vuelo en ambas ventanas.
2. Ventana 1: clic en 12C. **Esperado**: bloqueado a tu nombre, cuenta regresiva de 10:00. En la
   ventana 2, 12C se resalta y aparece bloqueado por otro en menos de 1 s.
3. Ventana 1: bloquea 12D un rato después. **Esperado**: la cuenta regresiva no se reinicia.
4. Ventana 1: intenta bloquear un quinto asiento. **Esperado**: mensaje del límite de 4.
5. Ventana 1: clic de nuevo en 12C. **Esperado**: se libera en ambas ventanas.
6. Recarga la ventana 1. **Esperado**: recuperas tus bloqueos con el tiempo restante correcto.
7. Para probar el vencimiento rápido, levanta con `HOLD_TTL_SECONDS=60`. **Esperado**: al llegar
   a 00:00 los asientos vuelven a disponibles en ambas ventanas en máximo 5 s.

### Historia 3: confirmación

1. Con asientos bloqueados, continúa al pago y completa comprador, un pasajero por asiento y la
   tarjeta `4111111111111111`, vencimiento futuro, CVV `123`.
   **Esperado**: código de 6 caracteres destacado y resumen; en la otra ventana los asientos
   pasan a reservados.
2. Repite con `4000000000000002`. **Esperado**: pago rechazado, los asientos siguen bloqueados.
3. Doble clic en pagar. **Esperado**: el botón se deshabilita y se crea una sola reserva.
4. En la consulta de boleto, ingresa el código y el correo. **Esperado**: ves el boleto. Con
   otro correo: "reserva no encontrada".

### Historia 4: tablero y administración

1. Abre `/flights/<id>/dashboard`. **Esperado**: contadores que suman 180, porcentaje de
   ocupación, barra y registro de actividad.
2. Bloquea y libera asientos desde otra ventana. **Esperado**: contadores y registro cambian
   sin recargar.
3. En `/admin`, sin clave, intenta cancelar. **Esperado**: rechazo claro. Con `ADMIN_KEY`,
   retrasa con una hora posterior. **Esperado**: todos ven RETRASADO y la nueva hora.
4. Detén y reinicia la red (DevTools → offline). **Esperado**: "reconectando", y al volver el
   tablero se resincroniza.

### Casos borde

- **Reinicio con bloqueos**: bloquea asientos y ejecuta `docker compose restart api`.
  **Esperado**: los bloqueos vigentes siguen; los vencidos durante la caída se liberan al
  arrancar.
- **AGOTADO**: el seed incluye un vuelo con 1 asiento libre (ver el log del seed). Resérvalo.
  **Esperado**: el vuelo pasa a AGOTADO en resultados, mapa y tablero.

## Prueba rápida por la API

```bash
FLIGHT=<id de un vuelo de la búsqueda>
CID=$(uuidgen)
curl -s "localhost:8080/api/flights?origin=BOG&destination=MDE&date=$(date -v+1d +%F)"
curl -s -X POST -H "X-Client-Id: $CID" localhost:8080/api/flights/$FLIGHT/seats/12C/hold
curl -s -H "X-Client-Id: $CID" localhost:8080/api/clients/me/holds
curl -s -X PATCH -H "X-Admin-Key: incorrecta" -H 'Content-Type: application/json' \
  -d '{"status":"CANCELLED"}' localhost:8080/api/admin/flights/$FLIGHT/status   # → 401
```

(`date -v+1d` es la sintaxis de macOS; en Linux usa `date -d tomorrow +%F`.)
