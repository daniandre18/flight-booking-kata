# Uso de IA

Registro de cómo se usó la IA durante el desarrollo (constitución, principio IX). Se actualiza en
cada fase.

## Herramientas

- Claude Code (modelo Claude Opus) con GitHub Spec Kit como flujo de trabajo.

## Flujo

1. `/speckit.constitution`: principios no negociables (v1.0.0 → 1.0.1).
2. `/speckit.specify` + `/speckit.clarify`: especificación con 4 historias y 3 clarificaciones
   (reloj compartido, clave de admin, consulta con código y correo).
3. Requisitos de experiencia de usuario añadidos a mano a la spec (RUX-001 a RUX-036).
4. `/speckit.plan` con el contexto técnico de [prompts/plan.md](prompts/plan.md).
5. `/speckit.tasks` y dos pasadas de `/speckit.analyze`, corrigiendo todos los hallazgos.
6. `/speckit.implement` por bloques, con revisión humana entre bloques.

## Qué se revisó y corrigió

- **Plan**: la IA detectó una carrera entre cancelar un vuelo y bloquear un asiento, y propuso
  bloquear primero la fila del vuelo con un orden de locks fijo.
- **Analyze**: se corrigieron dependencias entre módulos (UnitOfWork), el uso del 409, la ruta de
  health y el dimensionamiento del pool para la prueba de concurrencia.
- **Bloque 1**: las versiones vigentes del ecosistema obligaron a ajustar el plan: Prisma 7
  define el pool en el adaptador `pg` (no `connection_limit` en la URL), TypeScript 6.0
  (Angular 22 y typescript-eslint aún no soportan 7.0) y NestJS 11 (nestjs-zod y nestjs-pino
  aún no soportan Nest 12).

- **Bloque 2 (fases 3b y 4)**:
  - Al aplicar los criterios de evaluación (constitución 1.1.0), `/speckit.analyze` detectó que
    el límite por `X-Client-Id` se evadía rotando UUID: se añadió un contador por IP.
  - Un error real lo atrapó la e2e y no la unitaria: el proveedor de `FlightWriteContext` usaba
    `ModuleRef.get` en la fábrica y recibía dependencias aún sin instanciar (`null`). Se corrigió
    inyectando los tokens y se endureció la prueba unitaria (antes solo comprobaba `!== undefined`).
  - `max-params` ≤ 4 frente a la inyección de Nest se resolvió con objetos de dependencias.

## Prompts

En [prompts/](prompts/).
