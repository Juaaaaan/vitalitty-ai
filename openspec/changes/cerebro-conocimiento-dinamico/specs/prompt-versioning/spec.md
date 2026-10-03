# Spec Delta

## Purpose

Da a las instrucciones que gobiernan el comportamiento del sistema un sitio editable por el nutricionista, con historial inmutable y activación explícita, para que afinar una regla nutricional no requiera editar código ni desplegar.

## ADDED Requirements

### Requirement: Un prompt por función del sistema

El sistema SHALL mantener un prompt por cada función que dependa de instrucciones — al menos `generacion_dieta`, `extraccion_campos` y `validacion_alergias` —, identificado por un `slug` estable y con un nombre legible.

Cada prompt SHALL tener en todo momento, como máximo, una versión marcada como activa, y SHALL ser esa versión la que el sistema use cuando necesite ese prompt.

El `slug` y el `tipo` de un prompt SHALL ser estables: el código que lo consume lo pide por tipo, no por identificador de versión. Cambiar el nombre legible NO SHALL afectar a ninguna generación.

Un prompt SHALL ser visible únicamente para el usuario que lo creó: las instrucciones de un nutricionista no SHALL alcanzar la generación de otro.

#### Scenario: Listado de prompts con su versión vigente

- **WHEN** el usuario abre la pestaña Prompts del Cerebro
- **THEN** ve los prompts agrupados por tipo
- **AND** en cada uno queda marcado cuál es su versión activa y cuándo se creó

#### Scenario: Prompt sin ninguna versión activa

- **WHEN** un prompt existe pero no tiene versión activa
- **THEN** el listado lo señala como sin versión activa
- **AND** el sistema no lo usa en ninguna generación

#### Scenario: Prompt de otro usuario

- **WHEN** se pide un prompt que no pertenece al usuario de la sesión
- **THEN** el sistema responde como si no existiera
- **AND** no revela su contenido ni su historial

### Requirement: Editar un prompt crea una versión nueva

Guardar el contenido editado de un prompt SHALL crear una versión nueva con número consecutivo dentro de ese prompt, y NO SHALL modificar ni sustituir ninguna versión ya existente.

Guardar NO SHALL activar la versión creada. Una versión recién guardada SHALL quedar inerte hasta que alguien la active, de modo que un borrador a medias no pueda alterar el comportamiento del sistema.

Una versión guardada SHALL poder llevar una nota de cambio opcional que explique por qué se editó.

El sistema NO SHALL permitir modificar ni borrar el contenido de una versión ya creada.

Un contenido vacío NO SHALL crear versión: el sistema SHALL rechazarlo diciendo que el prompt no puede quedarse en blanco.

#### Scenario: Guardar un borrador mientras hay generaciones en curso

- **WHEN** el usuario guarda una edición del prompt `generacion_dieta`
- **THEN** queda registrada una versión nueva con el número siguiente
- **AND** la versión activa sigue siendo la que era
- **AND** una generación lanzada inmediatamente después usa la versión activa anterior, no el borrador

#### Scenario: Guardar sin cambios

- **WHEN** el usuario guarda un contenido idéntico al de la versión activa
- **THEN** el sistema avisa de que no hay cambios respecto a la versión activa y no crea una versión nueva

#### Scenario: Guardar un prompt vacío

- **WHEN** el usuario intenta guardar un prompt sin contenido
- **THEN** el sistema lo rechaza con un mensaje que dice que el prompt no puede estar vacío
- **AND** no se crea ninguna versión

### Requirement: Activar una versión es un acto explícito

Activar una versión SHALL ser una acción separada de guardar, disparada deliberadamente por el usuario, y SHALL consistir en mover el puntero de versión activa de ese prompt.

Activar una versión NO SHALL reescribir, borrar ni reordenar el historial.

A partir de la activación, la siguiente vez que el sistema necesite ese prompt SHALL usar la versión activada, **sin que medie ningún despliegue**.

Activar una versión SHALL dejar constancia de cuándo se activó.

El sistema NO SHALL permitir activar una versión que pertenezca a otro prompt o a otro usuario.

#### Scenario: La activación surte efecto en la siguiente generación

- **WHEN** el usuario activa una versión nueva del prompt `generacion_dieta`
- **AND** a continuación se lanza una generación de dieta
- **THEN** esa generación usa el contenido de la versión recién activada
- **AND** no ha hecho falta redesplegar la aplicación

#### Scenario: Generación ya en marcha cuando se activa

- **WHEN** una generación ya ha arrancado y durante ella se activa otra versión del prompt que usa
- **THEN** esa generación termina con la versión que leyó al arrancar
- **AND** la versión nueva se aplica a partir de la siguiente

#### Scenario: Activar una versión que no es de ese prompt

- **WHEN** se pide activar en un prompt una versión que pertenece a otro
- **THEN** el sistema lo rechaza y la versión activa no cambia

### Requirement: Histórico con diferencias y restauración

El sistema SHALL mostrar el histórico completo de versiones de un prompt, en orden, con su número, su fecha y su nota de cambio.

El sistema SHALL permitir comparar una versión con la anterior, mostrando qué texto cambió.

Restaurar una versión antigua SHALL crear una versión nueva con el contenido de la antigua y NO SHALL reescribir el historial ni reutilizar un número de versión ya usado. La versión restaurada SHALL quedar sujeta al mismo paso de activación explícita que cualquier otra.

#### Scenario: Comparar dos versiones consecutivas

- **WHEN** el usuario abre el histórico de un prompt y pide ver una versión frente a la anterior
- **THEN** ve el texto anterior y el nuevo con las diferencias señaladas

#### Scenario: Restaurar una versión anterior

- **WHEN** el usuario restaura la versión 3 de un prompt que ya va por la 7
- **THEN** se crea la versión 8 con el contenido de la 3
- **AND** las versiones 1 a 7 siguen intactas en el histórico
- **AND** la versión activa no cambia hasta que el usuario active la 8

### Requirement: Trazabilidad de lo que estaba vigente

El historial de versiones SHALL ser suficiente para reconstruir qué contenido de prompt estaba activo en un momento dado.

Una versión NO SHALL desaparecer del historial por haber sido sustituida, desactivada o restaurada.

#### Scenario: Explicar una dieta generada hace meses

- **WHEN** se quiere saber con qué instrucciones se generó una dieta de una fecha pasada
- **THEN** el historial conserva las versiones y sus fechas, y permite identificar cuál estaba activa entonces
