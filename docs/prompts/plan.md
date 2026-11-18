Escribe el plan en español. Stack y decisiones técnicas:

MONOREPO
- pnpm workspaces: backend/ (NestJS), frontend/ (Angular), shared/ (paquete @kata/shared).
- TypeScript strict en todo. docker-compose.yml con postgres:16, api y web. Scripts raíz: dev, test, lint, build, seed.

SHARED (@kata/shared)
- Enums SeatStatus (AVAILABLE, HELD, BOOKED) y FlightStatus (SCHEDULED, DELAYED, CANCELLED, SOLD_OUT).
- DTOs y esquemas zod: SearchFlightsQuery, FlightDto, SeatDto, HoldSeatResponse, CreateBookingRequest, BookingLookupRequest, BookingDto, FlightStatsDto, ErrorResponse.
- Eventos tipados de Socket.io: interfaces ServerToClientEvents y ClientToServerEvents y constantes con los nombres de eventos.

BACKEND (NestJS, monolito modular hexagonal)
- Módulos: flights, seats (holds), bookings, realtime, admin, health. Cada módulo con domain/ (entidades y reglas puras), application/ (casos de uso y puertos) e infrastructure/ (Prisma, controladores HTTP, gateway).
- Persistencia: PostgreSQL + Prisma. Tablas: flights (incluye seq), seats (id, flight_id, row, letter, status, held_by, hold_expires_at, version), bookings (id, code UNIQUE, flight_id, client_id, buyer_name, buyer_email, total, created_at), booking_seats (booking_id, seat_id UNIQUE, passenger_name), idempotency_keys.
- Bloqueo atómico: un único UPDATE condicional con prisma.seat.updateMany WHERE id = asiento AND (status = AVAILABLE OR (status = HELD AND hold_expires_at < now)) que pone HELD, held_by, hold_expires_at y version + 1. count = 1 gana; count = 0 responde 409 SEAT_UNAVAILABLE. Nunca SELECT y luego UPDATE.
- Límite de 4 bloqueos por cliente y vuelo: dentro de una transacción con pg_advisory_xact_lock por (clientId, flightId), contar y luego hacer el UPDATE condicional.
- Reloj compartido: en esa misma transacción, si el cliente ya tiene bloqueos vigentes en el vuelo, el asiento nuevo usa ese mismo hold_expires_at; si no tiene ninguno, now + HOLD_TTL_SECONDS. Sumar asientos nunca extiende el plazo.
- Confirmación: transacción con UPDATE condicional HELD → BOOKED WHERE held_by = cliente AND hold_expires_at > now para todos los asientos bloqueados vigentes del cliente en el vuelo; si el conteo no coincide, rollback y 410 HOLD_EXPIRED. UNIQUE(seat_id) en booking_seats como última defensa. Header Idempotency-Key para que un reintento devuelva la misma reserva. Pago ficticio detrás de un puerto PaymentGateway (FakePaymentGateway, 402 PAYMENT_DECLINED).
- Expiración: @nestjs/schedule cada 5 s libera bloqueos vencidos con UPDATE ... RETURNING y publica seat:released con reason EXPIRED. Además, toda operación trata un bloqueo vencido como disponible (verificación perezosa), así la corrección no depende del job. Al arrancar, el job corre una vez.
- Reloj inyectable (puerto Clock) para probar el tiempo.
- Eventos de dominio: después del commit, los casos de uso publican en un EventBus interno (EventEmitter2); el RealtimeGateway los traduce a Socket.io. Cada evento lleva la secuencia del vuelo (flights.seq incrementado en la misma transacción).
- Socket.io: namespace /realtime, rooms flight:{flightId} y search. Cliente → servidor: flight:join, flight:leave, search:subscribe. Servidor → cliente: seat:held, seat:released, seat:booked, flight:updated, flight:stats. Payload común: flightId, seq, occurredAt, más seatId, status y holdExpiresAt según el evento, y stats (available, held, booked, total).
- REST bajo /api: GET /flights?origin&destination&date, GET /flights/:id, GET /flights/:id/seats (snapshot con seq), GET /flights/:id/stats, POST /flights/:id/seats/:seatId/hold, DELETE /flights/:id/seats/:seatId/hold, GET /clients/me/holds, POST /bookings, POST /bookings/lookup con { code, email } (el correo no va en la URL; si el código o el correo no coinciden, 404 BOOKING_NOT_FOUND con el mismo mensaje en ambos casos), PATCH /admin/flights/:id/status (header X-Admin-Key comparado con ADMIN_KEY del entorno; sin clave o con una incorrecta, 401 ADMIN_UNAUTHORIZED), GET /health. Ver el dashboard no pide clave. Header X-Client-Id obligatorio en bloqueos y reservas.
- Errores: filtro global que devuelve { code, message, details } con 400/401/402/404/409/410/422. Validación con los esquemas zod de shared (nestjs-zod). Logs con pino.
- Cancelación de vuelo: libera todos los bloqueos en una transacción y emite seat:released (reason FLIGHT_CANCELLED) y flight:updated. Al reservar el último asiento, el vuelo pasa a SOLD_OUT y se emite flight:updated.

FRONTEND (Angular estable, standalone components, signals, RxJS)
- Rutas: /search, /flights/:id/seats, /checkout, /booking/:code, /flights/:id/dashboard, /admin.
- RealtimeService: envuelve socket.io-client tipado con los eventos de shared, expone un Observable por evento y un signal con el estado de conexión.
- Estado del mapa: snapshot REST + aplicar solo eventos con seq mayor al último visto; si hay hueco en seq o reconexión, volver a pedir el snapshot antes de permitir acciones.
- Interacción: clic optimista con revert si el servidor responde 409; cuenta regresiva del bloqueo compartido; leyenda accesible (no solo color: icono o patrón por estado).
- ClientIdService: UUID en localStorage enviado por un HttpInterceptor y en el handshake del socket.
- Dashboard: tarjetas de contadores, barra de ocupación y registro de actividad.
- Diseño del mapa: componente propio con CSS Grid de botones (no canvas), 7 columnas (A B C, pasillo, D E F) y número de fila a los lados. Cada asiento con aria-label del tipo "Asiento 12C, pasillo, disponible" y navegación con flechas. Estados con color + icono. Resaltado breve (unos 600 ms) cuando un evento remoto cambia un asiento, sin mover el foco ni la vista.
- Layout: panel de resumen sticky a la derecha (abajo en móvil) con asientos, total y barra de cuenta regresiva; badge de conexión en el header. Angular Material solo para formularios, diálogos y toasts. Tokens de diseño en variables CSS. Mobile first. Contraste mínimo 4,5:1.
- Errores: interceptor que traduce el code del error a mensajes en español (toast).

PRUEBAS
- Backend: Jest para el dominio; e2e con Supertest contra Postgres real (Testcontainers o el contenedor de docker compose): 100 POST /hold en paralelo al mismo asiento → exactamente 1 respuesta 201 y 99 respuestas 409; reloj compartido (el segundo asiento vence a la misma hora que el primero); bloqueo vencido → 410 al confirmar; idempotencia; cancelación de vuelo con bloqueos activos; clave de admin incorrecta → 401; lookup con correo incorrecto → 404.
- Frontend: pruebas de RealtimeService y del reductor del mapa con eventos desordenados y duplicados.
- Opcional: Playwright con dos contextos de navegador para la prueba de 2 pestañas.

PUNTOS PENDIENTES DEL SPEC
- Un retraso que cambia el día de salida mueve el vuelo a los resultados de la nueva fecha (la búsqueda usa la hora de salida vigente).
- La confirmación compra todos los asientos bloqueados vigentes del cliente en ese vuelo; para comprar menos, primero libera los que no quiere.
- La constitución (principio VI) no lista el 401: regístralo en el Constitution Check como adición justificada por la clave de administrador.

SALIDAS
Genera research.md con cada decisión y sus alternativas descartadas, data-model.md con la máquina de estados del asiento, contracts/ con el OpenAPI del REST y el catálogo de eventos de Socket.io, y quickstart.md con los pasos de ejecución.
