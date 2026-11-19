# Catálogo de eventos en tiempo real (Socket.io)

**Fuente de verdad en código**: `@kata/shared` (interfaces `ServerToClientEvents` y
`ClientToServerEvents`, constantes `RealtimeEvents` y esquemas zod de cada payload). Este
documento las describe.

## Conexión

| Aspecto | Valor |
|---------|-------|
| Namespace | `/realtime` |
| Ruta | `/socket.io` (por defecto; nginx hace proxy con upgrade) |
| Handshake | `auth: { clientId: <uuid v4> }`, validado con `ClientIdSchema` de `@kata/shared` (constitución, principio X). Sin `clientId` válido la conexión se rechaza con `connect_error` y mensaje `CLIENT_ID_REQUIRED` |
| Rooms | `flight:{flightId}` (mapa y tablero) y `search` (resultados de búsqueda) |
| Reconexión | Automática del cliente Socket.io; al reconectar, el cliente vuelve a unirse a sus rooms y pide snapshot |

El socket **no acepta comandos** de negocio ni eventos de estado emitidos por clientes
(principios II y X): un evento desconocido se ignora y no se reenvía. Los payloads de
cliente → servidor se validan con los esquemas de `@kata/shared`; si no son válidos, el ack
responde `{ ok: false, code: 'VALIDATION_ERROR' }`. Los comandos (bloquear, liberar, confirmar y
cambiar estado) van por REST ([openapi.yaml](./openapi.yaml)). Los eventos se emiten solo
**después del commit**.

## Cliente → servidor

| Evento | Payload | Ack | Efecto |
|--------|---------|-----|--------|
| `flight:join` | `{ flightId: uuid }` | `{ ok: true, seq: number }` o `{ ok: false, code: 'FLIGHT_NOT_FOUND' \| 'VALIDATION_ERROR' }` | Une el socket al room `flight:{flightId}` |
| `flight:leave` | `{ flightId: uuid }` | `{ ok: true }` | Sale del room |
| `search:subscribe` | `{}` | `{ ok: true }` | Une el socket al room `search` |

## Servidor → cliente

### Campos comunes (`BaseEvent`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `flightId` | uuid | Vuelo afectado |
| `seq` | integer | Secuencia del vuelo; aumenta en 1 por evento de asiento o de vuelo. En el room `flight:{id}` cada evento tiene una `seq` distinta y consecutiva |
| `occurredAt` | ISO 8601 UTC | Hora del reloj inyectado al hacer el cambio |

### Eventos

| Evento | Rooms | Campos adicionales | Cuándo |
|--------|-------|--------------------|--------|
| `seat:held` | `flight:{id}` | `seatId`, `status: 'HELD'`, `holdExpiresAt`, `holderTag` | Bloqueo, incluida la toma de un bloqueo vencido |
| `seat:released` | `flight:{id}` | `seatId`, `status: 'AVAILABLE'`, `reason: 'MANUAL' \| 'EXPIRED' \| 'FLIGHT_CANCELLED'` | Liberación manual, vencimiento (job) o cancelación del vuelo |
| `seat:booked` | `flight:{id}` | `seatId`, `status: 'BOOKED'` | Confirmación; un evento por asiento con `seq` consecutivas |
| `flight:updated` | `flight:{id}` | `status`, `departureAt`, `arrivalAt`, `scheduledDepartureAt`, `delayed`, `change: 'DELAYED' \| 'CANCELLED' \| 'SOLD_OUT'` | Retraso, cancelación o AGOTADO |
| `flight:stats` | `search` (solo) | Resumen completo: `status`, `departureAt`, `arrivalAt`, `delayed`, `availableSeats`, `stats: { available, held, booked, total }` y `change` opcional (`'DELAYED' \| 'CANCELLED' \| 'SOLD_OUT'`) | Una vez por transacción que cambia asientos o el estado del vuelo, con la `seq` del último evento de esa transacción |

**Por qué `flight:stats` no viaja al room del vuelo**: su `seq` coincide con la del último
evento de la transacción. En el room del vuelo eso obligaría a aplicar un evento con `seq` igual
a la última aplicada, lo que prohíbe el principio II. El mapa y el tablero derivan los
contadores de su propio estado de asientos.

`holderTag` = primeros 16 caracteres hexadecimales de SHA-256(`clientId`). El `clientId` nunca
viaja en un evento. El frontend obtiene su propio tag en `GET /clients/me/holds`.

### Ejemplos

```json
{ "event": "seat:held", "data": {
  "flightId": "5b0c6f1e-0d3a-5f7e-9c41-2a8e1f0b7d10", "seq": 42,
  "occurredAt": "2026-11-19T14:03:11.204Z", "seatId": "12C", "status": "HELD",
  "holdExpiresAt": "2026-11-19T14:13:11.204Z", "holderTag": "9f86d081884c7d65" } }
```

```json
{ "event": "seat:released", "data": {
  "flightId": "5b0c6f1e-0d3a-5f7e-9c41-2a8e1f0b7d10", "seq": 43,
  "occurredAt": "2026-11-19T14:13:12.010Z", "seatId": "12C", "status": "AVAILABLE",
  "reason": "EXPIRED" } }
```

```json
{ "event": "flight:stats", "room": "search", "data": {
  "flightId": "5b0c6f1e-0d3a-5f7e-9c41-2a8e1f0b7d10", "seq": 43,
  "occurredAt": "2026-11-19T14:13:12.010Z", "status": "SCHEDULED",
  "departureAt": "2026-11-19T20:00:00.000Z", "arrivalAt": "2026-11-19T21:00:00.000Z",
  "delayed": false, "availableSeats": 170,
  "stats": { "available": 170, "held": 2, "booked": 8, "total": 180 } } }
```

## Reglas para el cliente

1. **Arranque**: emitir `flight:join` → pedir `GET /flights/:id/seats` → aplicar los eventos
   recibidos mientras tanto cuya `seq` sea mayor a la del snapshot.
2. **Orden y duplicados**: aplicar un evento de asiento o de vuelo solo si
   `seq === ultimaSeq + 1`. Si `seq <= ultimaSeq`, descartarlo (duplicado o viejo).
3. **Huecos**: si `seq > ultimaSeq + 1`, pedir el snapshot de nuevo y deshabilitar las acciones
   hasta tenerlo.
4. **Contadores** (mapa y tablero): se derivan del estado de asientos que mantiene el reductor
   compartido; en el room del vuelo no hay `flight:stats`.
5. **Reconexión**: al reconectar, volver a unirse a los rooms, pedir el snapshot (y
   `GET /clients/me/holds` en el mapa y el pago) y volver a permitir acciones solo después.
6. **Resultados de búsqueda** (room `search`): filtrar `flight:stats` por los vuelos listados y,
   por `flightId`: descartar si `seq <= ultimaSeq`; aplicar el resumen si
   `seq === ultimaSeq + 1`; ante un salto, volver a pedir el vuelo con
   `GET /api/flights/:id` (incluye `seq`), agrupando pedidos en 250 ms, y descartar los
   eventos con `seq` menor o igual a la del vuelo recibido.
7. **Propiedad**: un asiento `HELD` es "mío" si `holderTag` coincide con el propio.
