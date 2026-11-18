<!--
Sync Impact Report
==================
Cambio de versión: plantilla sin versionar → 1.0.0 (ratificación inicial)

Principios (plantilla genérica → definitivos):
- [PRINCIPLE_1_NAME] → I. Integridad de reservas primero
- [PRINCIPLE_2_NAME] → II. Comandos por HTTP, eventos por WebSocket
- [PRINCIPLE_3_NAME] → III. Contratos compartidos
- [PRINCIPLE_4_NAME] → IV. Arquitectura hexagonal modular
- [PRINCIPLE_5_NAME] → V. Pruebas primero en lo crítico
- (nuevo) VI. Errores explícitos
- (nuevo) VII. Simplicidad de prototipo
- (nuevo) VIII. Calidad
- (nuevo) IX. Documentación como entregable

Secciones añadidas:
- Restricciones técnicas (antes [SECTION_2_NAME])
- Flujo de desarrollo y puertas de calidad (antes [SECTION_3_NAME])
- Gobernanza (contenido completo)

Secciones eliminadas: ninguna.

Plantillas dependientes: no se modifican; leen la constitución en tiempo de ejecución.
- .specify/templates/plan-template.md — ✅ sin cambios necesarios (su "Constitution Check" se
  resuelve contra este archivo)
- .specify/templates/spec-template.md — ✅ sin cambios necesarios
- .specify/templates/tasks-template.md — ✅ sin cambios necesarios

TODO diferidos: ninguno.
-->

# Constitución de Flight Booking Realtime

Prototipo de reserva de asientos de vuelo en tiempo real, desarrollado como prueba técnica
Full Stack Senior. Esta constitución fija las reglas que no se negocian durante el diseño,
la implementación y la revisión.

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

### III. Contratos compartidos

- DTOs, enums, esquemas de validación y nombres y payloads de eventos viven SOLO en el paquete
  `shared/` y se importan desde `backend/` y `frontend/`.
- PROHIBIDO duplicar o redefinir tipos de contrato en cualquiera de los dos lados.
- Los esquemas de validación de `shared/` son los mismos que valida el backend en la entrada y
  de ellos se derivan los tipos TypeScript.

**Razón**: un único origen de contratos elimina la deriva entre cliente y servidor y convierte
los cambios incompatibles en errores de compilación.

### IV. Arquitectura hexagonal modular

- El dominio y los casos de uso NO DEBEN importar NestJS, Prisma, Socket.io ni ninguna otra
  librería de infraestructura.
- Los adaptadores (HTTP, WebSocket, persistencia, reloj, pagos) implementan puertos definidos
  por la capa de aplicación.
- Módulos del backend: `flights`, `seats`, `bookings`, `realtime`. Un módulo solo consume a
  otro a través de sus puertos o casos de uso públicos.

**Razón**: aislar el dominio permite probarlo sin infraestructura y cambiar adaptadores sin
tocar las reglas de negocio.

### V. Pruebas primero en lo crítico (NO NEGOCIABLE)

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

El reloj DEBE inyectarse como puerto; PROHIBIDO llamar a `Date.now()` o `new Date()` desde el
dominio o los casos de uso, para poder controlar el tiempo en las pruebas.

**Razón**: estos escenarios son los que rompen la integridad de reservas y no se pueden
verificar a mano de forma fiable.

### VI. Errores explícitos

- Todo error de la API DEBE usar el formato único `{ code, message, details }`, definido en
  `shared/`.
- Códigos HTTP:
  - `400` petición mal formada; `422` validación de negocio o de esquema fallida.
  - `404` el recurso no existe.
  - `409` conflicto de asiento (ya bloqueado o reservado por otro).
  - `410` bloqueo expirado.
  - `402` pago rechazado.
- El frontend DEBE mostrar cada error con un mensaje entendible para el usuario y revertir la
  UI optimista al último estado confirmado por el servidor.

**Razón**: un contrato de error uniforme permite al cliente reaccionar de forma determinista y
al evaluador entender cada fallo.

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
- ESLint y Prettier configurados y sin errores.
- Funciones pequeñas con una sola responsabilidad.
- Logs estructurados (JSON) con contexto (`flightId`, `seatId`, `clientId` cuando aplique).
- Endpoint `GET /health` que verifica también la conexión a la base de datos.
- Seeds reproducibles: el mismo comando produce siempre los mismos datos.
- Commits con formato Conventional Commits.

**Razón**: son señales directas de seniority y reducen defectos en un código que se escribe
rápido.

### IX. Documentación como entregable

- `README.md`, `docs/architecture.md` y `docs/ia.md` son entregables y DEBEN actualizarse en el
  mismo cambio que altera el diseño, la ejecución o el uso de IA que documentan.
- `README.md`: cómo levantar, probar y usar el sistema.
- `docs/architecture.md`: arquitectura, decisiones y estrategia de concurrencia.
- `docs/ia.md`: cómo se usó la IA durante el desarrollo.

**Razón**: el evaluador juzga también lo que puede leer; documentación desactualizada es un
defecto.

## Restricciones técnicas

- Monorepo con pnpm workspaces y tres paquetes: `backend/`, `frontend/` y `shared/`.
- Node.js en versión LTS vigente.
- Base de datos PostgreSQL; las garantías de atomicidad del principio I se apoyan en ella.
- Backend en NestJS con Prisma como adaptador de persistencia y Socket.io como adaptador de
  tiempo real, siempre detrás de puertos (principio IV).
- `docker compose up` levanta base de datos, backend y frontend, y aplica migraciones y seeds.

## Flujo de desarrollo y puertas de calidad

- Cada funcionalidad sigue el flujo de Spec Kit: especificación → plan → tareas →
  implementación. El "Constitution Check" del plan DEBE pasar antes de implementar.
- Puertas obligatorias antes de dar un cambio por terminado:
  1. `typecheck` y `lint` sin errores en los tres paquetes.
  2. Todas las pruebas pasan, incluidas las del principio V.
  3. `docker compose up` levanta el sistema completo desde cero.
  4. La documentación del principio IX refleja el cambio.
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

**Versión**: 1.0.0 | **Ratificada**: 2026-11-18 | **Última enmienda**: 2026-11-18
