# Especificación de funcionalidad: Reservas de vuelos en tiempo real

**Rama de la funcionalidad**: `001-realtime-flight-booking`

**Creada**: 2026-11-18

**Estado**: Borrador

**Entrada**: descripción del usuario: "Sistema de reservas de vuelos en tiempo real (prototipo
funcional). Los usuarios buscan vuelos, ven el mapa de asientos en vivo, bloquean asientos
temporalmente y confirman la compra. Cuando un usuario bloquea o reserva un asiento, todos los
demás usuarios conectados lo ven al instante y nunca hay sobre-reserva."

## Clarifications

### Session 2026-11-18

- Q: Cuando un cliente bloquea varios asientos del mismo vuelo, ¿cómo funciona su vencimiento?
  → A: Un solo reloj: todos sus bloqueos en el vuelo comparten un vencimiento que empieza con
  el primer asiento bloqueado.
- Q: ¿Quién puede cambiar el estado de un vuelo si no hay inicio de sesión? → A: Ver el
  tablero es libre; retrasar o cancelar exige una clave de administrador configurada al
  desplegar.
- Q: ¿Qué debe presentar una persona para consultar un boleto? → A: El código de reserva y el
  correo del comprador.

## Escenarios de usuario y pruebas *(obligatorio)*

### Actores

- **Cliente anónimo**: no inicia sesión. Su navegador genera y conserva un identificador de
  cliente que lo representa en todas sus acciones.
- **Espectador**: consulta libremente el tablero de ocupación de un vuelo.
- **Administrador**: además de ver el tablero, puede cambiar el estado del vuelo presentando
  la clave de administrador configurada al desplegar el sistema.

### Estados

- **Asiento**: DISPONIBLE, BLOQUEADO (con dueño y hora de vencimiento), RESERVADO (permanente).
- **Vuelo**: PROGRAMADO, RETRASADO, CANCELADO, AGOTADO.

### Historia de usuario 1 - Búsqueda y filtro de vuelos (Prioridad: P1)

Como usuario quiero buscar vuelos por origen, destino y fecha para ver los vuelos disponibles
con tarifa, hora de salida, hora de llegada, duración, estado y número de asientos disponibles.
Si un vuelo cambia de estado (cancelado, retrasado, agotado) o cambia su número de asientos
disponibles, la lista de resultados se actualiza sin recargar.

**Por qué esta prioridad**: es la puerta de entrada al sistema; sin búsqueda no se puede
llegar al mapa de asientos ni a la compra.

**Prueba independiente**: con los datos de prueba cargados, buscar una ruta y fecha, verificar
el filtrado y el orden, y desde otra ventana cambiar el estado de uno de los vuelos listados
para comprobar que la lista se actualiza sola.

**Escenarios de aceptación**:

1. **Dado** origen BOG, destino MDE y una fecha dentro de los próximos 7 días, **cuando**
   busco, **entonces** veo solo los vuelos de esa ruta y ese día, ordenados por hora de salida
   ascendente.
2. **Dado** que estoy viendo resultados, **cuando** un administrador cancela uno de esos
   vuelos, **entonces** en menos de 1 segundo aparece como CANCELADO y no me permite elegir
   asientos.
3. **Dado** que estoy viendo resultados, **cuando** otro cliente bloquea, libera o reserva un
   asiento de uno de esos vuelos, **entonces** el número de asientos disponibles del vuelo se
   actualiza en menos de 1 segundo.
4. **Dado** que se reserva el último asiento de un vuelo, **entonces** el vuelo pasa a AGOTADO
   en todos los resultados abiertos.
5. **Dado** una búsqueda sin vuelos coincidentes, **cuando** busco, **entonces** veo un estado
   vacío claro que lo explica.
6. **Dado** una fecha pasada, o un origen igual al destino, **cuando** intento buscar,
   **entonces** recibo un error de validación que indica qué corregir y no se ejecuta la
   búsqueda.

---

### Historia de usuario 2 - Selección y bloqueo temporal de asientos (Prioridad: P1)

Como cliente quiero seleccionar un asiento en el mapa interactivo del avión para bloquearlo
mientras completo mis datos de pago. Cuando bloqueo un asiento, los demás usuarios que miran
ese vuelo lo ven bloqueado al instante; cuando el bloqueo vence o lo libero, lo ven disponible
otra vez.

**Por qué esta prioridad**: es el núcleo del reto: garantiza que nunca haya sobre-reserva y
que todos vean el mismo estado del avión.

**Prueba independiente**: abrir el mismo vuelo en dos ventanas con clientes distintos,
bloquear y liberar asientos en una y observar la otra; lanzar clics simultáneos sobre el mismo
asiento y comprobar que solo uno lo obtiene.

**Escenarios de aceptación**:

1. **Dado** un asiento DISPONIBLE en un vuelo PROGRAMADO o RETRASADO y que no tengo otros
   bloqueos en ese vuelo, **cuando** hago clic, **entonces** queda BLOQUEADO a mi nombre
   durante el tiempo de bloqueo configurado (10 minutos por defecto) y veo una cuenta
   regresiva.
2. **Dado** que ya tengo asientos bloqueados en el vuelo, **cuando** bloqueo otro, **entonces**
   el nuevo asiento vence al mismo tiempo que los anteriores y sigo viendo una sola cuenta
   regresiva, que no se reinicia.
3. **Dado** que otro usuario tiene abierto el mismo vuelo, **cuando** bloqueo un asiento,
   **entonces** él lo ve bloqueado en menos de 1 segundo y no puede seleccionarlo.
4. **Dado** que dos usuarios hacen clic en el mismo asiento al mismo tiempo, **entonces**
   exactamente uno lo obtiene; el otro recibe el mensaje "Este asiento ya no está disponible. Elige otro asiento del mapa." y su mapa
   se corrige para mostrar el asiento bloqueado.
5. **Dado** un asiento que yo bloqueé, **cuando** vuelvo a hacer clic sobre él, **entonces** lo
   libero y todos lo ven DISPONIBLE.
6. **Dado** un asiento bloqueado por mí, **cuando** vence el tiempo sin confirmar,
   **entonces** el asiento vuelve a DISPONIBLE sin intervención y todos lo ven.
7. **Dado** que ya tengo 4 asientos bloqueados en un vuelo, **cuando** intento bloquear un
   quinto, **entonces** se rechaza con un mensaje que indica el límite.
8. **Dado** que tengo asientos bloqueados, **cuando** cierro la pestaña, **entonces** mis
   bloqueos se mantienen hasta su vencimiento; **cuando** recargo o vuelvo a abrir el vuelo,
   **entonces** recupero mis asientos bloqueados con su cuenta regresiva correcta.
9. **Dado** un asiento bloqueado por otro cliente o RESERVADO, **cuando** intento
   seleccionarlo, **entonces** el sistema no me lo asigna.

---

### Historia de usuario 3 - Confirmación y procesamiento de la reserva (Prioridad: P1)

Como cliente quiero confirmar la compra con datos ficticios de pasajero y de pago para obtener
un boleto con un código de reserva único. Tras confirmar, los asientos pasan a RESERVADO de
forma permanente y todos los usuarios los ven deshabilitados.

**Por qué esta prioridad**: cierra el flujo de valor; sin confirmación no hay venta.

**Prueba independiente**: con asientos bloqueados, confirmar con datos válidos y verificar el
código y el resumen; repetir con tarjeta de rechazo, con bloqueo vencido, con doble envío y con
vuelo cancelado.

**Escenarios de aceptación**:

1. **Dado** que tengo asientos bloqueados vigentes y datos válidos (comprador, un nombre de
   pasajero por asiento y tarjeta ficticia), **cuando** confirmo, **entonces** obtengo un
   código de reserva único de 6 caracteres y el resumen del boleto, y los asientos pasan a
   RESERVADO para todos en menos de 1 segundo.
2. **Dado** que mis bloqueos vencieron antes de confirmar, **cuando** confirmo, **entonces** la
   confirmación se rechaza con un mensaje claro que indica que el bloqueo expiró y debo elegir
   de nuevo.
3. **Dado** que uso la tarjeta de prueba de rechazo, **cuando** confirmo, **entonces** no se
   crea la reserva, veo que el pago fue rechazado y mis asientos siguen bloqueados hasta su
   vencimiento, de modo que puedo reintentar con otra tarjeta.
4. **Dado** que envío la misma confirmación dos veces (doble clic o reintento por fallo de
   red), **entonces** se crea una sola reserva y ambas respuestas muestran el mismo código.
5. **Dado** que el vuelo es cancelado mientras tengo asientos bloqueados, **entonces** mis
   bloqueos se liberan, se me notifica en pantalla y cualquier confirmación posterior se
   rechaza.
6. **Dado** un código de reserva existente y el correo del comprador de esa reserva,
   **cuando** consulto, **entonces** veo el boleto con vuelo, asientos, pasajeros, total pagado
   y estado actual del vuelo.
7. **Dado** un código de reserva inexistente, o un correo que no coincide con el de la
   reserva, **cuando** consulto, **entonces** veo el mismo mensaje claro de que no se encontró
   la reserva, sin revelar cuál de los dos datos falló.
8. **Dado** datos de pasajero o de tarjeta inválidos, **cuando** confirmo, **entonces** veo qué
   campos corregir y mis bloqueos no se alteran.

---

### Historia de usuario 4 - Tablero de estado del vuelo (Prioridad: P2)

Como administrador o espectador quiero ver en tiempo real la ocupación de un vuelo
(disponibles, bloqueados, reservados y porcentaje de ocupación) para monitorear la demanda. El
tablero reacciona al instante a cada bloqueo, liberación (manual o por vencimiento) y reserva
confirmada.

**Por qué esta prioridad**: aporta visibilidad operativa y demuestra el tiempo real, pero el
flujo de compra funciona sin él.

**Prueba independiente**: abrir el tablero de un vuelo y, desde otra ventana, bloquear,
liberar, dejar vencer y reservar asientos; verificar contadores y registro. Cortar la red y
restaurarla para comprobar la resincronización. Cambiar el estado del vuelo desde el tablero.

**Escenarios de aceptación**:

1. **Dado** el tablero de un vuelo, **entonces** los contadores de disponibles, bloqueados y
   reservados siempre suman el total de asientos del vuelo, y el porcentaje de ocupación es
   reservados ÷ total.
2. **Dado** el tablero abierto, **cuando** ocurre un bloqueo, una liberación, un vencimiento o
   una reserva, **entonces** los contadores se actualizan sin recargar en menos de 1 segundo y
   el evento aparece al inicio de un registro de actividad reciente.
3. **Dado** que el tablero pierde la conexión, **entonces** muestra "reconectando";
   **cuando** la conexión vuelve, **entonces** se resincroniza con el estado real del vuelo.
4. **Dado** un vuelo PROGRAMADO, RETRASADO o AGOTADO, **cuando** el administrador lo marca como
   RETRASADO con una nueva hora de salida, **entonces** todos los usuarios ven el retraso y la
   nueva hora en menos de 1 segundo.
5. **Dado** un vuelo no cancelado, **cuando** el administrador lo marca como CANCELADO,
   **entonces** se liberan todos sus bloqueos activos y todos los usuarios ven el cambio en
   menos de 1 segundo.
6. **Dado** que no presento la clave de administrador o presento una incorrecta, **cuando**
   intento retrasar o cancelar un vuelo, **entonces** la acción se rechaza con un mensaje
   claro y el vuelo no cambia.

---

### Casos borde

- Eventos que llegan desordenados o duplicados no dejan la pantalla en un estado viejo: un
  cambio antiguo nunca sobrescribe uno más reciente.
- Pérdida de conexión: la interfaz muestra "reconectando" y, al volver, se resincroniza con el
  estado real antes de permitir nuevas acciones.
- El servidor se reinicia con bloqueos activos: los vigentes se conservan con su vencimiento
  original y los que vencieron durante la caída se liberan y se notifican.
- Vuelo AGOTADO o CANCELADO: no se puede bloquear ningún asiento.
- Vuelo CANCELADO: no admite más cambios de estado.
- El mismo cliente abre el vuelo en dos pestañas: ambas muestran sus asientos como propios y
  el límite de 4 se cuenta una sola vez.
- Cliente que intenta liberar un asiento bloqueado por otro: se rechaza.
- Retraso con una nueva hora igual o anterior a la vigente: error de validación.
- Vuelo con todos sus asientos libres bloqueados pero no reservados: no está AGOTADO; muestra
  0 asientos disponibles y vuelve a mostrar disponibilidad si los bloqueos vencen.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Búsqueda**

- **RF-001**: El sistema DEBE permitir buscar vuelos por origen, destino y fecha, y devolver
  solo los vuelos de esa ruta con salida en ese día, ordenados por hora de salida ascendente.
- **RF-002**: Cada resultado DEBE mostrar tarifa, hora de salida, hora de llegada, duración,
  estado y número de asientos DISPONIBLES. Ver RUX-022.
- **RF-003**: El sistema DEBE rechazar con error de validación una búsqueda con fecha pasada,
  con origen igual a destino o con campos vacíos. Ver RUX-021.
- **RF-004**: El sistema DEBE mostrar un estado vacío explicativo cuando no hay resultados. Ver RUX-024.
- **RF-005**: Los resultados abiertos DEBEN actualizarse sin recargar cuando cambie el estado o
  el número de asientos disponibles de cualquiera de los vuelos listados. Ver RUX-023.

**Mapa de asientos y bloqueo**

- **RF-006**: El sistema DEBE mostrar un mapa del avión de 30 filas por 6 asientos (A a F),
  identificando ventana (A, F), medio (B, E) y pasillo (C, D), con el estado de cada asiento y
  distinguiendo los asientos bloqueados por el propio cliente. Ver RUX-001 a RUX-004.
- **RF-007**: El sistema DEBE garantizar que un asiento nunca esté bloqueado ni reservado por
  más de un cliente, incluso ante solicitudes simultáneas.
- **RF-008**: Al bloquear un asiento, el sistema DEBE asignarlo al cliente con un vencimiento
  compartido por todos sus bloqueos en ese vuelo: si no tiene bloqueos vigentes, el vencimiento
  es el momento del bloqueo más la duración configurada (10 minutos por defecto); si ya los
  tiene, el nuevo asiento hereda el vencimiento existente, que no se extiende.
- **RF-009**: El sistema DEBE rechazar un bloqueo sobre un asiento no DISPONIBLE con el mensaje
  "Este asiento ya no está disponible. Elige otro asiento del mapa." (texto de RUX-036) y corregir el mapa del cliente.
- **RF-010**: El sistema DEBE limitar a 4 los asientos bloqueados simultáneamente por un
  cliente en un mismo vuelo.
- **RF-011**: El cliente DEBE poder liberar un asiento que él bloqueó; nadie más puede
  liberarlo.
- **RF-012**: El sistema DEBE liberar automáticamente cada bloqueo vencido y notificarlo a
  todos los usuarios que miran el vuelo en un máximo de 5 segundos tras su vencimiento.
- **RF-013**: El sistema DEBE impedir bloquear asientos en vuelos AGOTADOS o CANCELADOS, y en
  vuelos cuya hora de salida ya pasó.
- **RF-014**: El sistema DEBE conservar los bloqueos de un cliente al cerrar o recargar la
  pestaña, y permitirle recuperarlos con su tiempo restante al volver.
- **RF-015**: Cada cambio de estado de un asiento DEBE ser visible para todos los usuarios que
  miran ese vuelo en menos de 1 segundo. Ver RUX-016 y CE-010.

**Confirmación y boleto**

- **RF-016**: El sistema DEBE permitir confirmar todos los asientos bloqueados vigentes del
  cliente en un vuelo en una única reserva, con datos del comprador (nombre y correo), un
  nombre de pasajero por asiento y una tarjeta ficticia (número de 16 dígitos, vencimiento
  futuro y código de seguridad de 3 dígitos).
- **RF-017**: La confirmación DEBE ser todo o nada: si los bloqueos vencieron, el vuelo fue
  cancelado o el pago es rechazado, no se reserva ningún asiento.
- **RF-018**: Si los bloqueos del cliente vencieron, el sistema DEBE rechazar la confirmación
  indicando que el bloqueo expiró.
- **RF-019**: Si el pago ficticio es rechazado, el sistema DEBE informarlo y mantener los
  bloqueos hasta su vencimiento original.
- **RF-020**: El sistema DEBE tratar los envíos repetidos de una misma confirmación como uno
  solo, devolviendo la misma reserva sin duplicarla ni repetir el cobro.
- **RF-021**: Al confirmar, el sistema DEBE pasar los asientos a RESERVADO de forma permanente,
  generar un código de reserva único de 6 caracteres alfanuméricos en mayúsculas y mostrar el
  resumen del boleto (vuelo, ruta, horario, asientos, pasajeros y total).
- **RF-022**: El total de la reserva DEBE ser la tarifa del vuelo multiplicada por el número de
  asientos.
- **RF-023**: Cuando se reserve el último asiento libre de un vuelo, el sistema DEBE pasarlo a
  AGOTADO y notificarlo a todos.
- **RF-024**: El sistema DEBE permitir consultar un boleto presentando el código de reserva y
  el correo del comprador (sin distinguir mayúsculas); si alguno no coincide, DEBE responder
  "reserva no encontrada" sin indicar cuál dato falló.

**Tablero y administración**

- **RF-025**: El sistema DEBE mostrar por vuelo los contadores de asientos disponibles,
  bloqueados y reservados, y el porcentaje de ocupación, actualizados en tiempo real.
- **RF-026**: El tablero DEBE mostrar un registro de actividad reciente con, como mínimo, los
  últimos 50 eventos del vuelo (tipo, asiento y hora), el más reciente primero.
- **RF-027**: El administrador DEBE poder marcar un vuelo no cancelado como RETRASADO, con una
  nueva hora de salida posterior a la vigente; la hora de llegada se desplaza lo mismo.
- **RF-028**: El administrador DEBE poder marcar un vuelo no cancelado como CANCELADO; esto
  libera todos sus bloqueos activos y notifica a sus dueños en pantalla.
- **RF-029**: Un vuelo CANCELADO NO DEBE admitir más cambios de estado.
- **RF-029a**: Retrasar o cancelar un vuelo DEBE exigir la clave de administrador configurada
  al desplegar; sin ella, o con una incorrecta, la acción se rechaza. Ver el tablero no exige
  clave.

**Consistencia en tiempo real**

- **RF-030**: Ante eventos desordenados o duplicados, la pantalla DEBE reflejar siempre el
  estado más reciente.
- **RF-031**: Ante una pérdida de conexión, la pantalla DEBE indicar "reconectando" y, al
  restablecerse, resincronizarse con el estado real. Ver RUX-018 a RUX-020.
- **RF-032**: Tras un reinicio del servidor, el sistema DEBE conservar los bloqueos vigentes y
  liberar y notificar los vencidos.
- **RF-033**: Ante cualquier acción rechazada, la pantalla DEBE mostrar un mensaje entendible y
  volver al último estado confirmado. Ver RUX-035 y RUX-036.

**Datos de prueba y operación**

- **RF-034**: El sistema DEBE incluir datos de prueba reproducibles: rutas entre BOG, MDE, CLO,
  CTG y BAQ con varios vuelos diarios en cada sentido durante los próximos 7 días, todos con
  aviones de 180 asientos.
- **RF-035**: El proyecto completo DEBE poder levantarse con un solo comando.

### Entidades clave

- **Aeropuerto**: código de 3 letras y ciudad (BOG Bogotá, MDE Medellín, CLO Cali, CTG
  Cartagena, BAQ Barranquilla).
- **Vuelo**: número de vuelo, origen, destino, hora de salida, hora de llegada, duración,
  tarifa única por asiento, estado y capacidad (180 asientos).
- **Asiento**: pertenece a un vuelo; fila (1-30), letra (A-F), tipo (ventana, medio,
  pasillo), estado, cliente dueño del bloqueo y hora de vencimiento cuando está BLOQUEADO.
- **Cliente**: identificador anónimo generado y conservado por el navegador.
- **Reserva**: código único de 6 caracteres, vuelo, cliente, comprador (nombre y correo),
  pasajeros con su asiento, total y fecha de confirmación. Nunca guarda el número completo de
  la tarjeta.
- **Evento de actividad**: tipo (bloqueo, liberación, vencimiento, reserva, cambio de estado
  del vuelo), vuelo, asiento si aplica, nuevo estado, orden dentro del vuelo y fecha.

## Requisitos de experiencia de usuario *(obligatorio)*

Estos requisitos describen cómo se presenta y se siente la selección de asientos. Complementan
los requisitos funcionales anteriores, que siguen vigentes.

### 1. Mapa de asientos con forma de cabina

- **RUX-001**: El mapa DEBE dibujarse con forma de cabina: filas 1 a 30 en orden de adelante
  hacia atrás, con el número de fila visible a ambos lados. Detalla RF-006.
- **RUX-002**: Los asientos A-B-C y D-E-F DEBEN aparecer separados por un pasillo visible.
- **RUX-003**: El mapa DEBE identificar el tipo de cada asiento: ventana (A y F), medio (B y E)
  y pasillo (C y D).
- **RUX-004**: El mapa DEBE indicar claramente cuál es la parte delantera del avión.

**Criterios de aceptación**:

1. **Dado** un vuelo abierto, **cuando** veo el mapa, **entonces** veo 30 filas numeradas a
   ambos lados, con A-B-C a un lado y D-E-F al otro separados por un pasillo.
2. **Dado** el mapa abierto, **cuando** lo observo sin interactuar, **entonces** sé cuál es la
   parte delantera del avión y en qué extremo está la fila 1.
3. **Dado** cualquier asiento, **cuando** lo observo, **entonces** puedo saber si es ventana,
   medio o pasillo.

### 2. Estados visibles y distinguibles

- **RUX-005**: El mapa DEBE distinguir cinco situaciones: disponible, seleccionado por mí
  (bloqueado a mi nombre), bloqueado por otro usuario, reservado y vuelo no disponible.
- **RUX-006**: Cada estado DEBE diferenciarse por color y, además, por un icono o patrón, de
  modo que se distinga sin percibir colores.
- **RUX-007**: Si el vuelo está CANCELADO o AGOTADO, todo el mapa DEBE verse deshabilitado,
  no admitir selección y mostrar un aviso con el motivo.
- **RUX-008**: Una leyenda DEBE explicar cada estado y permanecer visible mientras se usa el
  mapa.

**Criterios de aceptación**:

1. **Dado** un mapa con asientos en los cuatro estados de asiento, **cuando** lo veo en escala
   de grises, **entonces** puedo distinguir cada estado por su icono o patrón.
2. **Dado** un asiento que bloqueé, **cuando** veo el mapa, **entonces** se distingue de los
   asientos bloqueados por otros usuarios.
3. **Dado** un vuelo CANCELADO o AGOTADO, **cuando** abro su mapa, **entonces** todo el mapa se
   ve deshabilitado, veo un aviso que dice "Vuelo cancelado" o "Vuelo agotado" y ningún
   asiento responde a la selección.
4. **Dado** que estoy viendo un vuelo, **cuando** pasa a CANCELADO o AGOTADO, **entonces** el
   mapa se deshabilita y aparece el aviso sin recargar.
5. **Dado** el mapa abierto, **cuando** me desplazo por las filas, **entonces** la leyenda sigue
   visible.

### 3. Información del asiento

- **RUX-009**: Al pasar el cursor sobre un asiento o enfocarlo con el teclado, el sistema DEBE
  mostrar su código (por ejemplo 12C), su tipo (ventana, medio o pasillo), su precio y su
  estado.
- **RUX-010**: Todo el flujo (búsqueda, mapa, pago y boleto) DEBE poder completarse solo con
  el teclado. En el mapa, las flechas mueven el foco entre asientos (arriba y abajo cambian de
  fila; izquierda y derecha, de asiento) y Enter o Espacio seleccionan o liberan el asiento
  enfocado. El foco DEBE ser siempre visible.

**Criterios de aceptación**:

1. **Dado** el asiento 12C disponible, **cuando** paso el cursor sobre él, **entonces** veo
   "12C", "pasillo", su precio y "disponible".
2. **Dado** el mapa abierto, **cuando** me muevo con el teclado hasta un asiento, **entonces**
   veo la misma información que al pasar el cursor y puedo seleccionarlo sin usar el ratón.

### 4. Panel de resumen siempre visible

- **RUX-011**: Un panel de resumen DEBE permanecer visible mientras se usa el mapa y mostrar
  los asientos elegidos, el precio de cada uno y el total.
- **RUX-012**: El panel DEBE mostrar la cuenta regresiva del bloqueo compartido en minutos y
  segundos (mm:ss). La cuenta regresiva y su aviso de último minuto DEBEN seguir visibles
  durante todo el pago (ver RUX-026).
- **RUX-013**: Cuando quede 1 minuto o menos, la cuenta regresiva DEBE cambiar de aspecto
  para advertir que el tiempo se acaba.
- **RUX-014**: Al vencer el tiempo, el sistema DEBE mostrar un mensaje claro, quitar los
  asientos del resumen y mostrarlos disponibles en el mapa.
- **RUX-015**: El botón para continuar al pago DEBE estar habilitado solo si hay asientos
  bloqueados vigentes.

**Criterios de aceptación**:

1. **Dado** que bloqueé 2 asientos, **cuando** veo el panel, **entonces** aparecen ambos con su
   precio, el total es la suma de los dos y veo la cuenta regresiva en formato mm:ss.
2. **Dado** el mapa desplazado hasta la fila 30, **cuando** miro la pantalla, **entonces** el
   panel de resumen sigue visible.
3. **Dado** asientos bloqueados, **cuando** la cuenta regresiva llega a 01:00, **entonces** el
   panel muestra un aviso visual de que queda 1 minuto.
4. **Dado** asientos bloqueados, **cuando** la cuenta regresiva llega a 00:00, **entonces** veo
   un mensaje que indica que el tiempo venció, el resumen queda vacío y el mapa muestra esos
   asientos disponibles.
5. **Dado** que no tengo asientos bloqueados vigentes, **cuando** veo el panel, **entonces** el
   botón para continuar al pago está deshabilitado; **cuando** bloqueo un asiento,
   **entonces** se habilita.

### 5. Cambios de otros usuarios

- **RUX-016**: Cuando otro usuario bloquea, libera o reserva un asiento, ese asiento DEBE
  resaltarse durante unos 600 ms para que el cambio se note, sin mover la vista, quitar el foco ni
  interrumpir lo que estoy haciendo. Detalla RF-015.
- **RUX-017**: Si intento tomar un asiento que otro usuario acaba de ganar, DEBO ver un mensaje
  claro y el mapa DEBE corregirse solo para mostrar el estado real del asiento.

**Criterios de aceptación**:

1. **Dado** que miro un vuelo, **cuando** otro usuario bloquea, libera o reserva un asiento,
   **entonces** ese asiento se resalta durante unos 600 ms y cambia a su nuevo estado.
2. **Dado** que estoy escribiendo datos o navegando el mapa, **cuando** llega un cambio de otro
   usuario, **entonces** no pierdo lo que escribía, el foco ni mi posición en el mapa.
3. **Dado** que otro usuario acaba de ganar un asiento que mi pantalla aún muestra disponible,
   **cuando** hago clic en él, **entonces** veo el mensaje "Este asiento ya no está disponible. Elige otro asiento del mapa." y el
   asiento pasa a mostrarse como bloqueado por otro usuario sin que yo recargue.

### 6. Estado de la conexión en tiempo real

- **RUX-018**: Las pantallas de resultados, mapa, pago y tablero DEBEN mostrar un indicador
  visible del estado de la conexión en tiempo real: "conectado" o "reconectando". Detalla RF-031 (con RUX-019 y RUX-020).
- **RUX-019**: Mientras la conexión se está restableciendo, el mapa NO DEBE permitir
  seleccionar ni liberar asientos y DEBE explicar por qué (por ejemplo, "Reconectando: espera
  un momento para elegir asientos").
- **RUX-020**: Al restablecerse la conexión, el mapa, el panel de resumen (asientos, total y
  cuenta regresiva) y el resto de la pantalla DEBEN actualizarse solos con el estado real, sin
  recargar, antes de volver a permitir acciones.

**Criterios de aceptación**:

1. **Dado** que estoy en el mapa con conexión, **cuando** lo miro, **entonces** veo el
   indicador "conectado".
2. **Dado** que se pierde la conexión, **cuando** intento seleccionar un asiento, **entonces**
   el indicador dice "reconectando", el asiento no se selecciona y veo el motivo.
3. **Dado** que mientras estaba desconectado otro usuario reservó un asiento y uno de mis
   bloqueos venció, **cuando** vuelve la conexión, **entonces** el mapa muestra ese asiento
   reservado, el resumen ya no incluye el asiento vencido, el indicador vuelve a "conectado" y
   puedo seleccionar de nuevo, todo sin recargar.

### 7. Búsqueda y resultados

- **RUX-021**: El formulario de búsqueda DEBE pedir origen, destino y fecha; NO DEBE permitir
  elegir el mismo aeropuerto como origen y destino ni una fecha pasada, y DEBE mostrar junto al
  campo afectado el motivo del error. Detalla RF-003.
- **RUX-022**: Cada resultado DEBE mostrar hora de salida, hora de llegada, duración, tarifa,
  estado y asientos disponibles, con el estado diferenciado por texto y no solo por color. Detalla RF-002.
- **RUX-023**: Cuando un vuelo de los resultados pasa a RETRASADO, CANCELADO o AGOTADO, el
  resultado DEBE actualizarse sin recargar y mostrar un aviso del cambio (en un retraso, con la
  nueva hora). Los vuelos CANCELADOS o AGOTADOS NO DEBEN permitir abrir la selección de
  asientos. Detalla RF-005.
- **RUX-024**: Si no hay vuelos, la pantalla DEBE mostrar un estado vacío que explique que no
  hay vuelos para esa ruta y fecha y sugiera cambiar la búsqueda. Detalla RF-004.

**Criterios de aceptación**:

1. **Dado** el formulario, **cuando** elijo BOG como origen y como destino, o una fecha pasada,
   **entonces** veo junto al campo el motivo del error y no puedo buscar.
2. **Dado** resultados de BOG a MDE, **cuando** los veo, **entonces** cada vuelo muestra salida,
   llegada, duración, tarifa, estado y asientos disponibles.
3. **Dado** que veo resultados, **cuando** un vuelo listado se retrasa, **entonces** sin recargar
   veo un aviso de retraso y la nueva hora en ese resultado.
4. **Dado** que veo resultados, **cuando** un vuelo listado se cancela o se agota, **entonces**
   sin recargar veo el aviso correspondiente y ya no puedo elegir asientos en él.
5. **Dado** una búsqueda sin vuelos, **cuando** se muestran los resultados, **entonces** veo un
   mensaje de que no hay vuelos para esa ruta y fecha con una sugerencia para cambiarla.

### 8. Pago y boleto

- **RUX-025**: El formulario de pago DEBE pedir los datos del comprador (nombre y correo), un
  nombre de pasajero por cada asiento, identificado con su código de asiento, y los datos de
  la tarjeta ficticia. Cada campo DEBE validarse por separado, con el mensaje de error junto al
  campo, y conservar lo escrito cuando hay errores.
- **RUX-026**: Durante el pago DEBEN seguir visibles la cuenta regresiva del bloqueo y su
  aviso de último minuto (RUX-012 y RUX-013). Si el tiempo vence durante el pago, DEBE verse
  un mensaje claro y la opción de volver al mapa para elegir de nuevo.
- **RUX-027**: Al pulsar pagar, el botón DEBE deshabilitarse y mostrar que el pago se está
  procesando hasta recibir la respuesta, para evitar el doble envío. Si el pago es rechazado,
  el botón DEBE volver a habilitarse y verse el motivo.
- **RUX-028**: La pantalla del boleto DEBE mostrar destacado el código de reserva y, además, el
  vuelo (número, ruta, fecha y horas), los asientos con su pasajero y el total pagado.

**Criterios de aceptación**:

1. **Dado** que bloqueé 3 asientos, **cuando** abro el pago, **entonces** veo un campo de
   nombre de pasajero por cada asiento, identificado con su código (por ejemplo 12C).
2. **Dado** un correo mal escrito y un número de tarjeta incompleto, **cuando** salgo de cada
   campo o intento pagar, **entonces** veo el error junto a cada campo afectado y lo demás que
   escribí se conserva.
3. **Dado** que estoy en el pago, **cuando** quedan 01:00 de bloqueo, **entonces** sigo viendo
   la cuenta regresiva con el aviso de último minuto.
4. **Dado** que pulso pagar, **cuando** el pago se está procesando, **entonces** el botón está
   deshabilitado e indica que se procesa, y pulsarlo otra vez no hace nada.
5. **Dado** un pago rechazado, **cuando** recibo la respuesta, **entonces** veo que el pago fue
   rechazado y el botón se vuelve a habilitar.
6. **Dado** un pago aprobado, **cuando** se muestra el boleto, **entonces** veo el código de
   reserva destacado, el vuelo, los asientos con su pasajero y el total.

### 9. Tablero del vuelo

- **RUX-029**: El tablero DEBE mostrar los contadores de asientos disponibles, bloqueados y
  reservados, el porcentaje de ocupación y una barra de ocupación proporcional a ese
  porcentaje.
- **RUX-030**: El tablero DEBE mostrar un registro de actividad reciente en el que cada entrada
  indique la hora, el tipo de evento (bloqueo, liberación, vencimiento, reserva o cambio de
  estado del vuelo) y el asiento cuando aplique, con lo más reciente primero.
- **RUX-031**: Contadores, barra y registro DEBEN actualizarse en vivo, sin recargar.

**Criterios de aceptación**:

1. **Dado** un vuelo con 45 de 180 asientos reservados, **cuando** abro el tablero,
   **entonces** veo una ocupación de 25% y la barra llena en un cuarto.
2. **Dado** el tablero abierto, **cuando** otro usuario bloquea el asiento 7A, **entonces** sin
   recargar los contadores cambian y el registro muestra arriba una entrada con la hora,
   "bloqueo" y "7A".
3. **Dado** el tablero abierto, **cuando** se confirma una reserva, **entonces** los
   contadores, el porcentaje y la barra se actualizan sin recargar.

### 10. Accesibilidad y dispositivos

- Uso con teclado: cubierto por RUX-010 (sección 3), ampliado a todo el flujo.
- **RUX-032**: Cada asiento DEBE anunciarse en un lector de pantalla con su código, su tipo y
  su estado (por ejemplo, "12C, pasillo, disponible"), y los cambios de estado del asiento
  enfocado DEBEN anunciarse.
- **RUX-033**: En pantallas de celular (ancho de 640 px o menos), el panel de resumen DEBE ubicarse en la parte inferior
  de la pantalla, siempre visible, sin tapar el asiento enfocado.
- **RUX-034**: Todo el texto DEBE tener un contraste con su fondo de al menos 4,5:1 (3:1 para
  texto grande), incluido el texto sobre asientos, avisos y botones deshabilitados.

**Criterios de aceptación**:

1. **Dado** la pantalla de búsqueda, **cuando** uso solo el teclado, **entonces** puedo buscar,
   abrir un vuelo, bloquear un asiento, completar el pago y ver el boleto sin usar el ratón.
2. **Dado** el foco en el asiento 12C, **cuando** pulso la flecha derecha, **entonces** el foco
   pasa a 12D; **cuando** pulso la flecha abajo, **entonces** pasa a 13D; **cuando** pulso
   Enter o Espacio, **entonces** el asiento se bloquea o se libera.
3. **Dado** un lector de pantalla activo, **cuando** enfoco un asiento, **entonces** escucho su
   código, tipo y estado.
4. **Dado** una pantalla de 640 px de ancho o menos, **cuando** abro el mapa, **entonces** el panel de resumen
   está en la parte inferior y sigue visible al desplazarme.
5. **Dado** cualquier pantalla del flujo, **cuando** se mide el contraste de sus textos,
   **entonces** todos cumplen el mínimo de RUX-034.

### 11. Mensajes

- **RUX-035**: Todos los mensajes de éxito y de error DEBEN estar en español claro, sin
  códigos técnicos, identificadores internos ni jerga. Detalla RF-033 (con RUX-036).
- **RUX-036**: Cada mensaje de error DEBE decir qué pasó y qué puede hacer el usuario (por
  ejemplo, "Este asiento ya no está disponible. Elige otro asiento del mapa.").

**Criterios de aceptación**:

1. **Dado** cualquier error (asiento tomado, bloqueo vencido, pago rechazado, límite de 4
   asientos, vuelo cancelado, reserva no encontrada, clave de administrador incorrecta, sin
   conexión), **cuando** se muestra,
   **entonces** el texto está en español, no contiene códigos técnicos y dice qué pasó y qué
   hacer a continuación.
2. **Dado** una reserva confirmada o un asiento bloqueado con éxito, **cuando** se muestra la
   confirmación, **entonces** el mensaje está en español claro y sin códigos técnicos.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **CE-001**: 0 sobre-reservas en una prueba de 100 solicitudes simultáneas sobre el mismo
  asiento: exactamente 1 obtiene el asiento y 99 reciben el conflicto de asiento, que se muestra como "Este asiento ya no está disponible. Elige otro asiento del mapa."
- **CE-002**: Un cambio de asiento o de vuelo hecho en una pestaña se ve en otra pestaña en
  menos de 1 segundo. Ver también CE-010, su caso concreto en el mapa.
- **CE-003**: Un bloqueo vencido se libera y se notifica a todos en máximo 5 segundos tras su
  vencimiento.
- **CE-004**: El proyecto completo se levanta con un solo comando, sin pasos manuales
  adicionales, y queda listo con los datos de prueba.
- **CE-005**: En todo momento, los contadores del tablero suman el total de asientos del
  vuelo.
- **CE-006**: Un usuario nuevo completa el flujo buscar → elegir asiento → confirmar en menos
  de 3 minutos.
- **CE-007**: 100% de las confirmaciones repetidas producen una sola reserva.
- **CE-008**: Tras reconectarse, la pantalla coincide con el estado real del vuelo en menos de
  3 segundos.
- **CE-009**: Un usuario nuevo bloquea un asiento en máximo 3 clics desde los resultados de
  búsqueda.
- **CE-010**: Un bloqueo, liberación o reserva hecho por otro usuario se ve en el mapa en menos
  de 1 segundo. Caso concreto de CE-002 en el mapa.

## Supuestos

- La identidad del cliente es el identificador anónimo de su navegador; borrar los datos del
  navegador equivale a ser un cliente nuevo.
- La clave de administrador es un único secreto compartido configurado al desplegar; no hay
  cuentas, roles ni inicio de sesión de administradores.
- Todos los asientos de un vuelo tienen la misma tarifa; no hay clases ni precios por asiento.
- Liberar algunos asientos no cambia el vencimiento de los que siguen bloqueados; si el cliente
  libera todos, el siguiente bloqueo inicia un reloj nuevo.
- Una confirmación incluye todos los asientos bloqueados vigentes del cliente en ese vuelo.
- Una tarjeta de prueba designada siempre es rechazada; cualquier otra tarjeta con formato
  válido es aprobada.
- AGOTADO significa que todos los asientos están RESERVADOS; los bloqueos no agotan un vuelo.
  Como el cliente no puede cancelar reservas, un vuelo AGOTADO no vuelve a tener asientos.
- Si un vuelo AGOTADO se retrasa, se muestra la nueva hora y el vuelo sigue sin admitir
  bloqueos.
- Las reservas de un vuelo cancelado se conservan y su boleto muestra el estado CANCELADO; no
  hay reembolsos ni notificaciones fuera de la aplicación.
- La búsqueda del día actual muestra todos los vuelos del día, pero los ya salidos no admiten
  bloqueos.
- Las fechas y horas se muestran en la hora local de Colombia.

## Fuera de alcance

- Inicio de sesión real, pagos reales y envío de correos.
- Vuelos con escalas y precios dinámicos.
- Cambios o cancelaciones de reserva por parte del cliente.
