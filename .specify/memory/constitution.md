<!--
Sync Impact Report
==================
Cambio de versión: 1.0.1 → 1.1.0 (MINOR)

Fuente: docs/prompts/criterios-evaluacion.md, sección 1 (criterios de evaluación de la prueba:
código limpio, SOLID y DRY, seguridad y validaciones, pruebas unitarias).

Justificación del MINOR: se agrega un principio nuevo (X. Seguridad y validaciones) y se amplían
materialmente III, IV, V y VIII con reglas verificables (SOLID letra por letra, DRY, cobertura
mínima de pruebas unitarias, límites de complejidad). No se elimina ni se redefine de forma
incompatible ningún principio: todo lo que cumplía 1.0.1 sigue siendo válido, y lo nuevo añade
obligaciones. Por eso no es MAJOR, y como cambia el alcance normativo no es PATCH.

Principios modificados:
- III. Contratos compartidos → III. Contratos compartidos y DRY: una sola definición de tipos,
  esquemas y mensajes de error; un solo filtro global; un solo mapeo code → mensaje en el
  frontend; la misma validación zod en ambos lados.
- IV. Arquitectura hexagonal modular → IV. Arquitectura hexagonal modular y SOLID: cada letra con
  una regla verificable en el código.
- V. Pruebas primero en lo crítico → V. Pruebas primero en lo crítico y cobertura medida:
  pruebas unitarias obligatorias con dobles de los puertos y cobertura ≥ 80 % (líneas y ramas) en
  domain/, application/ y shared/, publicada con `pnpm test:cov`.
- VI. Errores explícitos: se agrega 429 (demasiados intentos), exigido por el principio X, y
  la prohibición de stack traces o detalles internos en la respuesta.
- VIII. Calidad: límites de complejidad (complexity ≤ 10, max-lines-per-function ≤ 40,
  max-params ≤ 4), sin console.log, identificadores en inglés, cobertura en la puerta de
  calidad. El contexto de los logs usa `holderTag` en lugar del `clientId` en claro, para ser
  coherente con el redact de X-Client-Id del principio X.

Principios añadidos:
- X. Seguridad y validaciones.

Secciones modificadas:
- Restricciones técnicas: helmet y @nestjs/throttler en el backend.
- Flujo de desarrollo y puertas de calidad: la cobertura mínima pasa a ser puerta obligatoria.

Secciones eliminadas: ninguna.

Plantillas dependientes (leen la constitución en tiempo de ejecución):
- .specify/templates/plan-template.md — ✅ sin cambios necesarios.
- .specify/templates/spec-template.md — ✅ sin cambios necesarios.
- .specify/templates/tasks-template.md — ✅ sin cambios necesarios.
- specs/001-realtime-flight-booking/plan.md — ⚠ pendiente: el Constitution Check no cubre aún
  el principio X ni las reglas nuevas de III, IV, V y VIII (sección 2 del documento fuente).
- specs/001-realtime-flight-booking/{spec,research,data-model,tasks}.md y contracts/ —
  ⚠ pendiente: sección 2 del documento fuente.

TODO diferidos (código ya implementado en el bloque 1 que debe ajustarse):
- TODO(ESLINT_COMPLEXITY): añadir complexity, max-lines-per-function y max-params.
- TODO(TEST_COV): script `pnpm test:cov` con umbral del 80 %.
- TODO(CLIENT_ID_V4): el decorador @ClientId() acepta cualquier UUID; debe exigir v4.
- TODO(LOG_CONTEXT): el logger registra `clientId` en customProps; debe usar `holderTag` y
  redactar X-Client-Id.
- TODO(HTTP_HARDENING): helmet, CORS restringido, límite de body y throttler (429).
- TODO(CARD_BRAND): guardar la marca de la tarjeta junto a los últimos 4 dígitos.
-->

# Constitución de Flight Booking Realtime

Prototipo de reserva de asientos de vuelo en tiempo real, desarrollado como prueba técnica
Full Stack Senior. Esta constitución fija las reglas que no se negocian durante el diseño,
la implementación y la revisión, e integra los criterios de evaluación de la prueba: código
limpio y buenas prácticas, SOLID y DRY, seguridad y validaciones, y pruebas unitarias.

## Principios fundamentales

### I. Integridad de reservas primero (NO NEGOCIABLE)

- Un asiento NUNCA puede quedar reservado ni bloqueado por dos clientes a la vez.
- Toda transición de estado de un asiento (disponible → bloqueado → reservado, bloqueado →
  disponible, etc.) DEBE ejecutarse en una sola operación atómica en la base de datos, por
  ejemplo un `UPDATE ... WHERE <estado esperado> RETURNING ...` cuyo número de filas afectadas
  decide el resultado, o una restricción única que haga fallar al segundo escritor.
- PROHIBIDO decidir con el patrón leer-y-luego-escribir (`SELECT` seguido de `UPDATE`), aunque
  esté dentro de una transacción.
- El servidor es la única fuente de verdad. El cliente solo pinta lo que el servidor confirma;
  cualquier estado optimista en la UI es provisional y se reemplaza por la respuesta o el
  evento del servidor.

**Razón**: la doble reserva es el fallo de negocio más grave del dominio y solo se evita de
forma fiable delegando la exclusión mutua en la base de datos.

### II. Comandos por HTTP, eventos por WebSocket

- Las acciones del usuario (bloquear, liberar, confirmar) DEBEN ser endpoints REST con códigos
  de estado claros (ver principio VI). PROHIBIDO ejecutar comandos a través del socket.
- El servidor difunde los cambios por Socket.io SOLO después de que la transacción haya hecho
  commit. Un evento nunca anuncia un estado que pueda revertirse.
- Cada evento DEBE incluir: `flightId`, `seatId`, estado nuevo, número de secuencia monótono
  por vuelo y fecha (ISO 8601, UTC).
- El cliente DEBE descartar eventos con secuencia menor o igual a la última aplicada y, si
  detecta un salto, volver a pedir el estado del vuelo por HTTP.

**Razón**: separar comandos de notificaciones da respuestas síncronas verificables y permite
ordenar y recuperar el estado en tiempo real sin ambigüedad.

### III. Contratos compartidos y DRY

- DTOs, enums, esquemas de validación, códigos y mensajes de error, y nombres y payloads de
  eventos viven SOLO en el paquete `shared/` (`@kata/shared`) y se importan desde `backend/` y
  `frontend/`.
- PROHIBIDO duplicar o redefinir tipos de contrato en cualquiera de los dos lados.
- Los esquemas zod de `shared/` son los mismos que validan el backend en la entrada y el
  frontend en sus formularios, y de ellos se derivan los tipos TypeScript. PROHIBIDO duplicar
  lógica de validación entre front y back.
- DRY en la infraestructura transversal: un solo filtro global de errores en el backend y un
  solo mapeo `code` → mensaje en el frontend.

**Razón**: un único origen de contratos elimina la deriva entre cliente y servidor y convierte
los cambios incompatibles en errores de compilación; una sola implementación de cada regla
evita que dos copias diverjan.

### IV. Arquitectura hexagonal modular y SOLID

- El dominio y los casos de uso NO DEBEN importar NestJS, Prisma, Socket.io ni ninguna otra
  librería de infraestructura.
- Los adaptadores (HTTP, WebSocket, persistencia, reloj, pagos) implementan puertos definidos
  por la capa de aplicación.
- Módulos del backend: `flights`, `seats`, `bookings`, `realtime`. Un módulo solo consume a
  otro a través de sus puertos o casos de uso públicos.
- SOLID, con cada letra verificable en el código:
  - **S (responsabilidad única)**: un caso de uso por clase (por ejemplo `HoldSeatUseCase`,
    `ReleaseSeatUseCase`, `ConfirmBookingUseCase`, `ChangeFlightStatusUseCase`). Controladores y
    gateways NO DEBEN contener lógica de negocio: traducen protocolo y delegan.
  - **O (abierto/cerrado)**: las variantes nuevas se agregan con adaptadores nuevos detrás de
    puertos (`PaymentGateway`, `Clock`, `EventPublisher`), sin modificar los casos de uso.
  - **L (sustitución de Liskov)**: los adaptadores falsos y reales de un mismo puerto son
    intercambiables y DEBEN pasar la misma prueba de contrato.
  - **I (segregación de interfaces)**: puertos pequeños y enfocados (por ejemplo un puerto de
    escritura de bloqueos separado de uno de consulta). PROHIBIDOS los repositorios "dios".
  - **D (inversión de dependencias)**: dominio y aplicación dependen solo de interfaces; la
    inyección se hace con tokens de NestJS en la capa de infraestructura.

**Razón**: aislar el dominio permite probarlo sin infraestructura y cambiar adaptadores sin
tocar las reglas de negocio; hacer SOLID verificable lo convierte en criterio de revisión y no
en una aspiración.

### V. Pruebas primero en lo crítico y cobertura medida (NO NEGOCIABLE)

Las siguientes pruebas son obligatorias, se escriben antes de la implementación
correspondiente y DEBEN pasar antes de dar la funcionalidad por terminada:

1. **Concurrencia**: N solicitudes paralelas sobre el mismo asiento producen exactamente 1
   éxito y N−1 respuestas 409, contra PostgreSQL real.
2. **Expiración del bloqueo**: un bloqueo vencido deja el asiento disponible para otro cliente.
3. **Confirmación con bloqueo vencido**: responde 410 y no crea reserva.
4. **Idempotencia de la confirmación**: repetir la misma confirmación devuelve el mismo
   resultado y no crea una segunda reserva ni un segundo cobro.
5. **Cancelación de vuelo con bloqueos activos**: los bloqueos se liberan o invalidan y los
   clientes reciben el evento correspondiente.

Pruebas unitarias (obligatorias y medidas):

- El dominio y los casos de uso se prueban en aislamiento con dobles de los puertos
  (repositorios en memoria, reloj falso, pago falso), escritos antes de cada caso de uso.
- Cobertura mínima del **80 % de líneas y de ramas** en `backend/src/**/domain`,
  `backend/src/**/application` y `shared/`.
- En el frontend son obligatorias las pruebas unitarias del reductor del mapa, de
  `RealtimeService`, de los interceptores y de los componentes clave (mapa de asientos y panel
  de resumen).
- La cobertura se obtiene con `pnpm test:cov` y su resultado se publica en el `README.md`.

El reloj DEBE inyectarse como puerto; PROHIBIDO llamar a `Date.now()` o `new Date()` desde el
dominio o los casos de uso, para poder controlar el tiempo en las pruebas.

**Razón**: los escenarios críticos son los que rompen la integridad de reservas y no se pueden
verificar a mano; la cobertura medida demuestra que las reglas de negocio están probadas en
aislamiento y no solo de punta a punta.

### VI. Errores explícitos

- Todo error de la API DEBE usar el formato único `{ code, message, details }`, definido en
  `shared/`.
- Códigos HTTP:
  - `400` petición mal formada.
  - `401` clave de administrador ausente o incorrecta (acciones de administración).
  - `422` validación de negocio o de esquema fallida, incluidos el límite de asientos
    bloqueados por cliente y vuelo y una `Idempotency-Key` repetida con otro contenido.
  - `404` el recurso no existe.
  - `409` conflicto de asiento (ya bloqueado o reservado por otro).
  - `410` bloqueo expirado.
  - `402` pago rechazado.
  - `429` demasiados intentos (límite de solicitudes, principio X).
- Las respuestas de error NUNCA incluyen stack traces, SQL ni detalles internos.
- El frontend DEBE mostrar cada error con un mensaje entendible para el usuario y revertir la
  UI optimista al último estado confirmado por el servidor.

**Razón**: un contrato de error uniforme permite al cliente reaccionar de forma determinista y
al evaluador entender cada fallo, sin filtrar información útil para un atacante.

### VII. Simplicidad de prototipo

- El alcance es un prototipo de 1 día: monolito modular, sin microservicios.
- Sin autenticación real: la identidad es anónima mediante un `clientId` generado por el
  cliente.
- Sin pagos reales: el adaptador de pagos es simulado y debe poder forzar un rechazo.
- YAGNI: no se añade nada que no exija un requisito actual.
- Todo el sistema DEBE levantarse con `docker compose up`.

**Razón**: el tiempo es el recurso escaso; la complejidad que no aporta a los requisitos resta
calidad a lo que sí se evalúa.

### VIII. Calidad

- TypeScript en modo `strict` en todos los paquetes. PROHIBIDO `any` (explícito o implícito).
- ESLint y Prettier configurados y sin errores. ESLint DEBE aplicar reglas de complejidad:
  `complexity` ≤ 10, `max-lines-per-function` ≤ 40 y `max-params` ≤ 4. PROHIBIDO
  `console.log`.
- Funciones pequeñas con una sola responsabilidad (medidas por las reglas anteriores).
- Identificadores en inglés (variables, funciones, clases, archivos); los textos para el
  usuario y la documentación, en español.
- Logs estructurados (JSON) con contexto (`flightId`, `seatId` y el `holderTag` del cliente
  cuando aplique; nunca el `clientId` en claro, ver principio X).
- Endpoint `GET /health` que verifica también la conexión a la base de datos.
- Seeds reproducibles: el mismo comando produce siempre los mismos datos.
- Commits con formato Conventional Commits.

**Razón**: son señales directas de seniority y reducen defectos en un código que se escribe
rápido; los límites medibles evitan discutir qué es una función "pequeña".

### IX. Documentación como entregable

- `README.md`, `docs/architecture.md` y `docs/ia.md` son entregables y DEBEN actualizarse en el
  mismo cambio que altera el diseño, la ejecución o el uso de IA que documentan.
- `README.md`: cómo levantar, probar y usar el sistema.
- `docs/architecture.md`: arquitectura, decisiones y estrategia de concurrencia.
- `docs/ia.md`: cómo se usó la IA durante el desarrollo.

**Razón**: el evaluador juzga también lo que puede leer; documentación desactualizada es un
defecto.

### X. Seguridad y validaciones

- **Validación de toda entrada**: body, query, params, headers y payloads de socket se validan
  con los esquemas zod de `shared/`. `X-Client-Id` DEBE ser un UUID v4 válido.
- **Endurecimiento HTTP**: helmet, CORS restringido al origen del frontend y límite de tamaño
  del body.
- **Límite de solicitudes**: rate limiting (`@nestjs/throttler`) en bloqueos, confirmación,
  consulta del boleto y endpoints de administración; el exceso responde `429`.
- **Clave de administrador**: `ADMIN_KEY` se compara en tiempo constante
  (`crypto.timingSafeEqual`).
- **Secretos**: solo por variables de entorno; `.env.example` en el repositorio y `.env` en
  `.gitignore`.
- **Datos de pago**: los datos de tarjeta NUNCA se guardan ni se registran; solo la marca y los
  últimos 4 dígitos. Los logs redactan los headers sensibles (`X-Admin-Key`, `X-Client-Id`) y
  los datos de pago.
- **Acceso a datos**: solo por Prisma con consultas parametrizadas; el SQL crudo solo con los
  tagged templates de Prisma. PROHIBIDO concatenar SQL.
- **Tiempo real**: el handshake del socket valida el `clientId`; los clientes NO PUEDEN emitir
  eventos de estado (principio II).
- **Frontend**: PROHIBIDO `innerHTML` y `bypassSecurityTrust*`.
- **Errores**: al cliente, sin stack traces ni detalles internos (principio VI).

**Razón**: aunque es un prototipo sin autenticación real, expone escritura concurrente y datos
personales; estas medidas son baratas y cubren las amenazas habituales (inyección, abuso por
fuerza bruta, fuga de secretos y suplantación del cliente anónimo).

## Restricciones técnicas

- Monorepo con pnpm workspaces y tres paquetes: `backend/`, `frontend/` y `shared/`.
- Node.js en versión LTS vigente.
- Base de datos PostgreSQL; las garantías de atomicidad del principio I se apoyan en ella.
- Backend en NestJS con Prisma como adaptador de persistencia y Socket.io como adaptador de
  tiempo real, siempre detrás de puertos (principio IV). helmet y `@nestjs/throttler` para el
  endurecimiento HTTP (principio X).
- `docker compose up` levanta base de datos, backend y frontend, y aplica migraciones y seeds.

## Flujo de desarrollo y puertas de calidad

- Cada funcionalidad sigue el flujo de Spec Kit: especificación → plan → tareas →
  implementación. El "Constitution Check" del plan DEBE pasar antes de implementar.
- Puertas obligatorias antes de dar un cambio por terminado:
  1. `typecheck` y `lint` sin errores en los tres paquetes.
  2. Todas las pruebas pasan, incluidas las del principio V.
  3. Cobertura de pruebas unitarias ≥ 80 % de líneas y ramas en las rutas del principio V
     (`pnpm test:cov`).
  4. `docker compose up` levanta el sistema completo desde cero.
  5. La documentación del principio IX refleja el cambio.
- Toda desviación de un principio DEBE quedar justificada por escrito en la sección de
  complejidad del plan; sin justificación, el cambio no se acepta.

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica, guía o preferencia del proyecto.
- Toda enmienda DEBE: describir el cambio, justificarlo, subir la versión y actualizar la
  fecha de última enmienda.
- Versionado semántico:
  - MAJOR: eliminación o redefinición incompatible de un principio o de la gobernanza.
  - MINOR: nuevo principio o sección, o ampliación material de una guía.
  - PATCH: aclaraciones, redacción o erratas sin cambio semántico.
- Cada plan y cada revisión de código DEBEN verificar el cumplimiento de esta constitución.

**Versión**: 1.1.0 | **Ratificada**: 2026-11-18 | **Última enmienda**: 2026-11-18
