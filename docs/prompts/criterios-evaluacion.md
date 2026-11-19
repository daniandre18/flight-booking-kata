# Criterios de evaluación de la prueba

La prueba se evalúa con estos criterios: código limpio y buenas prácticas, principios SOLID y DRY, seguridad y validaciones, pruebas unitarias y sustentación. Este archivo los integra a la constitución, al spec, al plan y a las tareas.

## SECCIÓN 1 — Enmienda de la constitución (versión MINOR 1.1.0)

- Principio IV (arquitectura): hazlo explícito con SOLID, cada letra verificable en el código:
  - S: un caso de uso por clase (HoldSeatUseCase, ReleaseSeatUseCase, ConfirmBookingUseCase, ChangeFlightStatusUseCase…); controladores y gateways sin lógica de negocio.
  - O: nuevas variantes se agregan con adaptadores nuevos detrás de puertos (PaymentGateway, Clock, EventPublisher), sin modificar los casos de uso.
  - L: los adaptadores falsos y reales del mismo puerto son intercambiables y pasan la misma prueba de contrato.
  - I: puertos pequeños y enfocados (por ejemplo SeatHoldsPort separado de SeatQueryPort), nada de repositorios "dios".
  - D: dominio y aplicación dependen solo de interfaces; la inyección usa tokens de NestJS; nunca importan Prisma, NestJS ni Socket.io.
- Principio III (contratos) y VIII (calidad): DRY explícito. Una sola definición de tipos, esquemas y mensajes de error en @kata/shared; un solo filtro global de errores; un solo mapeo code → mensaje en el frontend; nada de lógica de validación duplicada entre front y back (ambos usan los mismos esquemas zod).
- Principio V (pruebas): las pruebas unitarias son obligatorias y se miden. Dominio y casos de uso se prueban en aislamiento con dobles de los puertos (repositorios en memoria, reloj falso, pago falso). Umbral mínimo de cobertura: 80 % de líneas y ramas en backend/src/**/domain y backend/src/**/application, y en shared/. En frontend: pruebas unitarias del reductor del mapa, RealtimeService, interceptores y componentes clave (mapa de asientos, panel de resumen). La cobertura se publica con pnpm test:cov y el resultado va al README.
- Principio VIII (calidad): ESLint con reglas de complejidad (complexity ≤ 10, max-lines-per-function ≤ 40, max-params ≤ 4), sin any, sin console.log, Prettier, nombres en inglés en el código. Puerta de calidad: typecheck, lint, test y cobertura en verde.
- Principio nuevo X — Seguridad y validaciones:
  - Toda entrada (body, query, params, headers, payloads de socket) se valida con los esquemas zod de shared; X-Client-Id debe ser UUID v4 válido.
  - helmet, CORS restringido al origen del frontend y límite de tamaño de body.
  - Rate limiting (@nestjs/throttler) en bloqueos, confirmación, lookup del boleto y endpoints de admin; exceso → 429.
  - ADMIN_KEY se compara en tiempo constante (crypto.timingSafeEqual).
  - Secretos solo por variables de entorno; .env.example en el repo, .env en .gitignore.
  - Los datos de tarjeta nunca se guardan ni se registran: solo marca y últimos 4 dígitos. pino con redact de headers sensibles (X-Admin-Key, X-Client-Id) y datos de pago.
  - Acceso a datos solo por Prisma con consultas parametrizadas; SQL crudo solo con tagged templates de Prisma.
  - El handshake del socket valida el clientId; los clientes no pueden emitir eventos de estado.
  - El frontend no usa innerHTML ni bypassSecurityTrust.
  - Errores al cliente sin stack traces ni detalles internos.
- Actualiza el Sync Impact Report y justifica por qué es MINOR.

## SECCIÓN 2 — Ajustes al spec, plan, research y tareas

Edita solo spec.md, plan.md, research.md, data-model.md, contracts/ y tasks.md. No escribas código. Mantén la numeración continua de tareas y actualiza referencias y dependencias.

1. spec.md: agrega requisitos no funcionales de seguridad sin nombrar tecnologías: validación de toda entrada con mensajes claros, límite de intentos (respuesta "demasiados intentos, espera un momento"), la tarjeta nunca se almacena (solo últimos 4 dígitos en el boleto), sin detalles internos en los errores. Agrega un criterio de éxito de calidad: cobertura de pruebas unitarias ≥ 80 % en las reglas de negocio.
2. research.md: agrega una decisión "Aplicación de SOLID y DRY" con un ejemplo concreto por letra (clase o puerto real del plan) y otra "Seguridad" con cada medida, la amenaza que mitiga y la alternativa descartada.
3. contracts/openapi.yaml: agrega 429 TOO_MANY_REQUESTS a los endpoints limitados y documenta el header X-Client-Id como UUID.
4. tasks.md:
   - Fase 1: configuración de ESLint con las reglas de complejidad, Prettier, scripts test:cov con umbral 80 % en domain/, application/ y shared/, .env.example.
   - Fase 2: pruebas unitarias de los esquemas zod de shared (casos válidos e inválidos).
   - Fase 3: helmet, CORS, límite de body, throttler global con límites por ruta, pino redact, filtro de errores sin stack, guard de admin con timingSafeEqual y validación del handshake del socket. Cada uno con su prueba.
   - Fases 4 a 6 y 9: antes de cada caso de uso, sus pruebas unitarias con dobles de los puertos (repositorio en memoria, reloj falso, pago falso). Las pruebas e2e contra Postgres se mantienen como están.
   - Una prueba de contrato compartida para FakePaymentGateway (y cualquier adaptador intercambiable) que demuestre L de SOLID.
   - Fases 7 y 8: pruebas unitarias del reductor del mapa, RealtimeService, interceptores, componente del mapa (teclado y aria-label) y panel de resumen.
   - Fase 10: docs/architecture.md con una sección "SOLID y DRY en el código" (tabla principio → ejemplo → archivo) y otra "Seguridad" (medida → amenaza → dónde está); README con el reporte de cobertura y cómo correrlo.
5. Al terminar, dame una tabla criterio de evaluación → artefactos y tareas que lo cubren. No implementes.
