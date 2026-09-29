# Spec Delta

## Purpose

Da al nutricionista una sección de conversación donde pregunta y pide cosas en lenguaje natural sobre sus propios pacientes, y la IA responde ejecutando herramientas de dominio acotadas sobre los datos reales, sin tocar nada que él no haya confirmado.

## ADDED Requirements

### Requirement: Sección Asistente independiente del flujo de consulta

El sistema SHALL ofrecer una sección de asistente accesible desde la navegación de la aplicación, separada del flujo de grabar consulta y generar dieta. Entrar en el asistente NO SHALL iniciar, modificar ni interrumpir ninguna consulta en curso.

El asistente SHALL estar disponible solo para un usuario autenticado, y todo lo que consulte o proponga SHALL limitarse a los pacientes de ese usuario.

#### Scenario: Acceso desde la navegación

- **WHEN** el usuario autenticado abre la sección Asistente
- **THEN** ve una conversación vacía con un cuadro para escribir y un botón para dictar
- **AND** el flujo de nueva consulta sigue exactamente igual que antes

#### Scenario: Usuario sin sesión

- **WHEN** alguien sin sesión válida intenta usar el asistente
- **THEN** el sistema no responde ninguna consulta de datos y le indica que vuelva a iniciar sesión

### Requirement: Conversación con respuesta incremental

El sistema SHALL entregar la respuesta del asistente a pantalla conforme se produce, sin esperar a tenerla completa. Mientras el asistente está usando una herramienta, la pantalla SHALL indicar en lenguaje llano qué está consultando, de modo que una espera larga nunca parezca un bloqueo.

El hilo de la conversación SHALL conservarse mientras el usuario permanece en la sección, y cada pregunta nueva SHALL responderse con el hilo anterior en contexto, de modo que "y la anterior" o "compárala con la de antes" se refieran a lo ya hablado.

El sistema NO SHALL persistir la conversación: al salir de la sección o recargar, el hilo SHALL empezar vacío.

#### Scenario: Respuesta larga

- **WHEN** el asistente responde a una pregunta que requiere varias consultas
- **THEN** el usuario ve primero qué se está consultando y después el texto de la respuesta conforme se escribe

#### Scenario: Referencia a lo ya hablado

- **WHEN** el usuario pregunta por un paciente y a continuación escribe "compara su última dieta con la anterior"
- **THEN** el asistente entiende de qué paciente se trata sin volver a preguntarlo

#### Scenario: Recarga de la página

- **WHEN** el usuario recarga la sección Asistente
- **THEN** la conversación aparece vacía y no se ofrece ningún historial anterior

### Requirement: Entrada por texto y por voz

El asistente SHALL aceptar la pregunta escrita y, alternativamente, dictada. El dictado SHALL usar la misma transcripción que el resto de la aplicación y SHALL depositar el texto transcrito en el cuadro de entrada, donde el usuario puede corregirlo antes de enviarlo.

Un fallo de transcripción NO SHALL enviar nada al asistente: SHALL mostrarse el error en español y el cuadro de entrada SHALL quedar disponible para escribir.

#### Scenario: Pregunta dictada

- **WHEN** el usuario dicta "qué pacientes tienen revisión esta semana" y detiene la grabación
- **THEN** el texto transcrito aparece en el cuadro de entrada, sin enviarse todavía
- **AND** el usuario puede editarlo y enviarlo

#### Scenario: Falla la transcripción

- **WHEN** la transcripción del dictado falla
- **THEN** el usuario ve el mensaje de error en español y el cuadro de entrada sigue usable
- **AND** no se envía ninguna pregunta al asistente

### Requirement: El asistente solo actúa a través de herramientas de dominio

El asistente SHALL obtener todo dato de paciente exclusivamente a través del catálogo cerrado de herramientas de dominio. El sistema NO SHALL exponerle consultas SQL, acceso a ficheros, ejecución de comandos ni ninguna vía de acceso libre a la base de datos.

Toda ejecución de herramienta SHALL hacerse con la identidad del usuario de la sesión, de modo que un paciente de otro usuario sea inalcanzable aunque el asistente pida su identificador.

Si el asistente pide una herramienta que no existe o con argumentos inválidos, el sistema SHALL devolverle el error como resultado de esa herramienta, sin interrumpir la conversación, y el asistente SHALL poder corregir o explicar que no puede hacerlo.

Cuando lo pedido queda fuera del catálogo, el asistente SHALL decir que no puede hacerlo en lugar de inventar la respuesta.

#### Scenario: Petición fuera del catálogo

- **WHEN** el usuario pide algo que ninguna herramienta cubre, como borrar un paciente
- **THEN** el asistente responde que no puede hacerlo desde el asistente
- **AND** no se modifica ningún dato

#### Scenario: Identificador de otro usuario

- **WHEN** el asistente solicita datos de un paciente que no pertenece al usuario de la sesión
- **THEN** la herramienta responde como no encontrado
- **AND** la respuesta no revela ningún dato de ese paciente

#### Scenario: Argumentos inválidos

- **WHEN** el asistente llama a una herramienta con un argumento que falta o no es válido
- **THEN** recibe un error descriptivo como resultado de la herramienta
- **AND** la conversación continúa

### Requirement: Lecturas libres, escrituras confirmadas

Las herramientas que solo leen datos SHALL ejecutarse sin intervención del usuario.

Las herramientas que crean o modifican datos NO SHALL persistir nada por sí mismas. El asistente SHALL **proponer** la acción, y el sistema SHALL mostrarla al usuario como propuesta, indicando en español qué se hará exactamente y sobre qué paciente, con una opción de confirmar y otra de descartar.

La acción SHALL ejecutarse únicamente tras la confirmación explícita del usuario. Descartarla, salir de la sección o recargar SHALL dejar los datos del paciente intactos.

El sistema SHALL verificar, al confirmar, que la acción confirmada es la propuesta y que su paciente pertenece al usuario, sin fiarse de lo que llegue del cliente.

#### Scenario: Retoque de dieta propuesto y confirmado

- **WHEN** el usuario pide un retoque de la dieta de un paciente y el asistente propone generar una versión nueva
- **THEN** ve la propuesta con el paciente y el cambio pedido, sin que se haya guardado nada
- **AND** al confirmarla se genera y se guarda la nueva versión, y el asistente lo comunica

#### Scenario: Propuesta descartada

- **WHEN** el usuario descarta una propuesta de escritura
- **THEN** no se crea ni se modifica ninguna dieta, consulta ni documento
- **AND** la conversación continúa

#### Scenario: Se abandona la sección con una propuesta pendiente

- **WHEN** hay una propuesta sin confirmar y el usuario recarga o sale de la sección
- **THEN** la propuesta desaparece y ningún dato del paciente ha cambiado

#### Scenario: Consulta de datos sin confirmación

- **WHEN** el usuario pregunta por las dietas o las estadísticas de un paciente
- **THEN** el asistente responde directamente, sin pedir ninguna confirmación

### Requirement: Límites de la vuelta de conversación y errores

El sistema SHALL acotar el número de herramientas que el asistente encadena en una misma respuesta. Al alcanzar el límite, SHALL cerrar la vuelta con lo que tenga y decir en español que no ha podido completar la petición y que se concrete más, en lugar de seguir indefinidamente.

Si una herramienta falla por un error del sistema, el asistente SHALL recibirlo como resultado y SHALL poder responder con lo que sí ha averiguado, indicando qué parte no ha podido consultar.

Si la respuesta se corta por un fallo general, el sistema SHALL mostrar en español que la respuesta se ha interrumpido y ofrecer reintentar, conservando el hilo anterior. Un fallo NO SHALL dejar datos a medio escribir: una acción confirmada que falle SHALL informar de que no se ha guardado.

#### Scenario: Petición demasiado abierta

- **WHEN** una petición hace que el asistente encadene más herramientas que el límite
- **THEN** la respuesta se cierra indicando en español que no se ha podido completar y pidiendo concretar

#### Scenario: Una herramienta falla

- **WHEN** una de las herramientas consultadas falla y las demás responden
- **THEN** el asistente responde con lo que ha podido consultar e indica qué parte ha fallado

#### Scenario: Falla una acción confirmada

- **WHEN** el usuario confirma una acción y su ejecución falla
- **THEN** ve en español que no se ha guardado y puede reintentarlo
- **AND** no queda ninguna dieta ni consulta a medias
