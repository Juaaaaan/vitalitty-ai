# Spec Delta

## Purpose

Decide, al arrancar cada generación, qué instrucciones y qué documentos de conocimiento entran en contexto: el prompt activo del tipo que toca y los documentos aplicables al paciente, elegidos por metadata, sin romper el prefijo cacheado ni la generación cuando no hay nada que leer.

## ADDED Requirements

### Requirement: La selección ocurre al arrancar la generación

El sistema SHALL resolver, en el instante en que arranca una generación, el conjunto de instrucciones y documentos que entrarán en contexto, y SHALL usar ese conjunto de principio a fin de esa generación.

Una activación posterior NO SHALL afectar a una generación ya arrancada.

La selección SHALL quedar resuelta antes de la primera llamada al modelo: el sistema NO SHALL ampliar ni cambiar el conjunto a mitad de la generación.

#### Scenario: Conjunto congelado al arrancar

- **WHEN** arranca una generación y, mientras corre, se activa una versión nueva de un documento que había seleccionado
- **THEN** la generación en curso termina con el contenido que leyó al arrancar
- **AND** la siguiente generación recoge ya la versión nueva

### Requirement: Los documentos se eligen por metadata, no por similitud

La selección de documentos de conocimiento SHALL hacerse a partir de su `tipo` y sus etiquetas, cruzados con el perfil del paciente — patologías, objetivo, tipo de actividad —, más los documentos marcados de inclusión incondicional.

La selección NO SHALL requerir una llamada a un modelo ni el cálculo de similitud semántica: SHALL ser una consulta sobre la metadata, para no añadir latencia ni coste a un presupuesto de tiempo que ya está al límite.

Un documento sin versión activa NO SHALL entrar en contexto, aunque su metadata encaje.

Un documento SHALL entrar como mucho una vez, aunque encaje por varios criterios a la vez.

#### Scenario: Paciente celíaco

- **WHEN** se genera la dieta de un paciente con celiaquía registrada
- **AND** existe un documento activo con la etiqueta correspondiente al gluten
- **THEN** ese documento entra en el contexto de la generación

#### Scenario: Documento que no aplica a este paciente

- **WHEN** existe un documento activo cuya metadata no cruza con el perfil del paciente ni está marcado de inclusión incondicional
- **THEN** ese documento no entra en el contexto de esa generación

#### Scenario: Documento marcado de inclusión incondicional

- **WHEN** se genera cualquier dieta
- **THEN** los documentos activos marcados de inclusión incondicional entran en contexto, con independencia del perfil del paciente

#### Scenario: Documento sin versión activa

- **WHEN** un documento cuya metadata encaja con el paciente no tiene versión activa
- **THEN** no entra en contexto
- **AND** la generación continúa sin él

#### Scenario: El documento encaja por dos criterios

- **WHEN** un documento es seleccionable tanto por su tipo como por una de sus etiquetas
- **THEN** su contenido aparece una sola vez en el contexto

### Requirement: Composición dentro del bloque cacheado

El contenido seleccionado SHALL componerse al principio del prompt, dentro del bloque marcado para caché, en este orden: el prompt activo del tipo que corresponde, los documentos de conocimiento seleccionados y las dietas de ejemplo.

El contexto del paciente y lo dicho en la consulta SHALL seguir yendo después, fuera del prefijo cacheado.

El bloque compuesto SHALL ser idéntico byte a byte entre dos generaciones consecutivas mientras no se active ninguna versión nueva: el orden de los documentos SHALL ser determinista y el bloque NO SHALL contener marcas de tiempo, identificadores de petición ni nada que varíe entre llamadas.

Un cambio en el conjunto seleccionado SHALL invalidar el prefijo cacheado a propósito; la primera generación tras el cambio paga una llamada en frío y las siguientes vuelven a cachear.

#### Scenario: Dos generaciones consecutivas sin tocar el Cerebro

- **WHEN** se lanzan dos generaciones seguidas sin que se haya activado ninguna versión entre ellas
- **AND** ambas seleccionan el mismo conjunto de documentos
- **THEN** la segunda reutiliza el bloque desde caché en lugar de volver a facturarlo íntegro

#### Scenario: Dos pacientes distintos con el mismo conjunto seleccionado

- **WHEN** dos generaciones consecutivas son de pacientes distintos pero seleccionan el mismo conjunto de prompt y documentos
- **THEN** el bloque se sigue sirviendo desde caché
- **AND** solo el contexto de paciente y la transcripción se facturan como entrada nueva

#### Scenario: Se activa una versión nueva entre dos generaciones

- **WHEN** entre dos generaciones se activa una versión nueva del prompt o de un documento seleccionado
- **THEN** la primera generación posterior al cambio no encuentra el bloque en caché
- **AND** las siguientes, sin más cambios, vuelven a encontrarlo

### Requirement: La generación no depende de que el Cerebro tenga contenido

El sistema SHALL mantener en el código unas instrucciones por defecto para cada función, y SHALL usarlas cuando no haya una versión activa de ese prompt.

Si la consulta de selección falla, no responde a tiempo o devuelve un conjunto vacío, el sistema SHALL continuar la generación con las instrucciones por defecto y sin documentos de conocimiento, en lugar de abortarla.

Un recurso del Cerebro no disponible NO SHALL producir un error visible al usuario a mitad de una consulta, ni dejar la consulta sin dieta.

El sistema SHALL dejar registrado en el servidor que se usó el camino degradado, para que no pase inadvertido.

Las instrucciones por defecto del código SHALL producir una dieta que cumpla el contrato del documento de dieta, igual que la versión activa.

#### Scenario: Primer despliegue, Cerebro recién sembrado

- **WHEN** se genera una dieta justo después de desplegar, sin que nadie haya editado nada en el Cerebro
- **THEN** la dieta resultante es equivalente en calidad y estructura a la que producía el sistema antes del cambio

#### Scenario: Tabla de documentos vacía

- **WHEN** no existe ningún documento de conocimiento
- **THEN** la generación se completa usando el prompt activo y las dietas de ejemplo
- **AND** no se muestra ningún error al usuario

#### Scenario: La base de datos no responde al seleccionar

- **WHEN** la consulta de selección falla o agota su margen de tiempo
- **THEN** la generación continúa con las instrucciones por defecto del código
- **AND** la consulta termina con su dieta guardada
- **AND** queda registrado en el servidor que se recurrió al camino degradado

### Requirement: Aislamiento por usuario

La selección SHALL considerar únicamente los prompts y documentos del usuario de la sesión que lanza la generación.

El conocimiento de un usuario NO SHALL entrar en la generación de otro, ni siquiera estando marcado de inclusión incondicional.

#### Scenario: Dos nutricionistas en la misma instalación

- **WHEN** un usuario lanza una generación
- **THEN** solo entran en contexto sus propios prompts y documentos activos
- **AND** ninguno de los de otro usuario
