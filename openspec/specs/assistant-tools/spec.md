# assistant-tools Specification

## Purpose

Define el catálogo cerrado de herramientas de dominio que el asistente puede usar sobre los datos del nutricionista: qué hace cada una, qué recibe, qué devuelve y cuáles leen frente a las que proponen una escritura.

## Requirements

### Requirement: Catálogo cerrado y clasificado

El sistema SHALL ofrecer al asistente un catálogo fijo y conocido de herramientas de dominio. Cada herramienta SHALL declararse como **de lectura** o **de escritura**, y esa clasificación SHALL ser la que determina si se ejecuta sola o requiere confirmación del usuario.

Son de lectura: buscar paciente, obtener paciente, obtener dietas, comparar dietas, estadísticas del paciente y pacientes por criterio. Son de escritura: generar dieta y renderizar el PDF de una dieta.

Ninguna herramienta SHALL devolver datos de pacientes que no sean del usuario de la sesión, ni revelar si existen.

#### Scenario: Herramienta de lectura

- **WHEN** el asistente llama a una herramienta de lectura
- **THEN** se ejecuta y devuelve su resultado sin pedir confirmación

#### Scenario: Herramienta de escritura

- **WHEN** el asistente llama a una herramienta de escritura
- **THEN** no se persiste nada y la llamada se presenta al usuario como propuesta

### Requirement: Buscar paciente por texto

La herramienta de búsqueda SHALL recibir un texto y devolver los pacientes del usuario cuyo nombre o correo encaje con él, cada uno con su identificador y los datos mínimos para distinguirlos (nombre, correo y teléfono), acotados a un número máximo de resultados.

Si no encaja ninguno, SHALL devolver una lista vacía, y el asistente SHALL decírselo al usuario en lugar de elegir un paciente parecido.

Si encajan varios, el asistente NO SHALL adivinar cuál es: SHALL pedir al usuario que elija entre los encontrados.

#### Scenario: Un solo resultado

- **WHEN** el usuario pide algo sobre "Rubén" y solo un paciente encaja
- **THEN** el asistente continúa con ese paciente

#### Scenario: Homónimos

- **WHEN** dos pacientes del usuario se llaman igual
- **THEN** el asistente los lista con su correo o teléfono y pide al usuario que elija
- **AND** no consulta los datos de ninguno de los dos hasta que elija

#### Scenario: Sin coincidencias

- **WHEN** ningún paciente encaja con el texto
- **THEN** el asistente responde que no encuentra a ese paciente y no inventa datos

### Requirement: Obtener la ficha y el contexto de un paciente

La herramienta de ficha SHALL recibir el identificador de un paciente y devolver sus datos personales y el último valor conocido de sus campos clínicos (alergias, intolerancias, patologías, medicación, preferencias y alimentos a evitar o priorizar), junto con los resúmenes de sus consultas más recientes.

NO SHALL devolver el documento completo de ninguna dieta: para eso está la herramienta de dietas.

Un identificador que no corresponda a un paciente del usuario SHALL responder como no encontrado.

#### Scenario: Ficha de un paciente con histórico

- **WHEN** se pide la ficha de un paciente con varias consultas
- **THEN** el resultado incluye sus datos, sus campos clínicos conocidos y los resúmenes recientes

#### Scenario: Paciente ajeno

- **WHEN** se pide la ficha de un paciente de otro usuario
- **THEN** la herramienta responde como no encontrado, sin revelar ningún dato

### Requirement: Obtener las dietas de un paciente

La herramienta de dietas SHALL recibir el identificador de un paciente y, opcionalmente, cuántas versiones quiere, y SHALL devolver esas versiones de la más reciente a la más antigua, cada una con su número de versión, su fecha, sus calorías objetivo y si tiene PDF disponible.

El documento completo SHALL devolverse solo cuando se piden pocas versiones, para no volcar documentos enteros en la conversación; por defecto SHALL devolverse la última.

Un paciente sin dietas SHALL devolver una lista vacía y el asistente SHALL decirlo.

#### Scenario: Última dieta

- **WHEN** se piden las dietas de un paciente sin indicar cuántas
- **THEN** se devuelve su versión más reciente con su contenido

#### Scenario: Varias versiones

- **WHEN** se piden las últimas tres versiones
- **THEN** se devuelven v3, v2 y v1 en ese orden, con versión, fecha y calorías

#### Scenario: Paciente sin dietas

- **WHEN** el paciente aún no tiene ninguna dieta
- **THEN** la herramienta devuelve una lista vacía y el asistente lo comunica

### Requirement: Comparar dos dietas de un paciente

La herramienta de comparación SHALL recibir un paciente y dos versiones de dieta, y SHALL devolver la comparación entre ellas: calorías, peso, raciones por grupo de alimento con su diferencia, alimentos que entran y salen, y el resumen de qué cambió y por qué.

SHALL reutilizar la comparación ya existente de la aplicación y su resultado guardado: comparar desde el asistente NO SHALL recalcular una comparación ya calculada ni generar ni modificar ninguna dieta.

Si las versiones pedidas no son consecutivas, la herramienta SHALL indicarlo y devolver la comparación de la versión más reciente de las dos con su anterior existente, dejando claro qué par ha comparado. Si alguna versión no existe, o la más antigua de las dos es la primera dieta del paciente, SHALL devolver un error explicativo en lugar de una comparación vacía.

#### Scenario: Comparar la última con la anterior

- **WHEN** el usuario pide "compara la última dieta de Rubén con la anterior"
- **THEN** el asistente responde con las diferencias de calorías, peso y raciones, los alimentos que entran y salen, y la explicación de qué cambió y por qué

#### Scenario: Comparación ya calculada

- **WHEN** esa misma comparación ya se calculó antes en la ficha del paciente
- **THEN** el asistente la devuelve sin recalcularla

#### Scenario: Primera dieta

- **WHEN** se pide comparar la v1 de un paciente
- **THEN** la herramienta indica que es su primera dieta y que no hay versión anterior

### Requirement: Estadísticas de evolución del paciente

La herramienta de estadísticas SHALL recibir un paciente y devolver su evolución a lo largo de las consultas: calorías objetivo, peso registrado y raciones por grupo de alimento, cada punto con su fecha y su número de versión de dieta.

NO SHALL devolver gramos de macronutrientes: las dietas prescriben raciones por grupo de alimento, no macros.

Los valores no registrados SHALL devolverse como ausentes, nunca estimados ni arrastrados de otra consulta.

#### Scenario: Evolución de peso y calorías

- **WHEN** se piden las estadísticas de un paciente con varias consultas
- **THEN** se devuelve un punto por consulta con su fecha, sus calorías objetivo y su peso

#### Scenario: Consulta sin peso

- **WHEN** una consulta no registró peso
- **THEN** ese punto aparece sin peso y no se rellena con el de otra consulta

### Requirement: Pacientes por criterio

La herramienta de criterio SHALL devolver los pacientes del usuario que cumplen un criterio de agenda o de histórico, entre un conjunto acotado: cita o revisión en un rango de fechas, pacientes sin consulta desde una fecha, y pacientes sin ninguna dieta.

El resultado SHALL incluir, por paciente, lo que hace falta para actuar: nombre, identificador y el dato que lo hace encajar (fecha y tipo de la cita, o fecha de la última consulta).

Un criterio que la herramienta no cubra SHALL devolver un error explicativo, y el asistente SHALL decir que no puede filtrar por eso en lugar de aproximar el resultado.

#### Scenario: Revisiones de esta semana

- **WHEN** el usuario pregunta qué pacientes tienen revisión esta semana
- **THEN** el asistente devuelve la lista de pacientes con revisión en ese rango, con el día y la hora de cada cita

#### Scenario: Semana sin citas

- **WHEN** no hay ninguna cita de revisión en el rango
- **THEN** el asistente responde que no hay ninguna, sin inventar pacientes

#### Scenario: Criterio no cubierto

- **WHEN** el usuario pide filtrar por un criterio que la herramienta no contempla
- **THEN** el asistente responde que no puede filtrar por eso desde el asistente

### Requirement: Generar una dieta a partir de una instrucción

La herramienta de generación SHALL recibir un paciente y una instrucción en lenguaje natural con el retoque pedido, y SHALL producir el documento de dieta resultante partiendo de la última dieta del paciente y de su memoria, respetando el contrato del documento de dieta.

Es una herramienta de escritura: SHALL proponerse al usuario y NO SHALL guardar nada hasta su confirmación. Al confirmarse, el documento SHALL guardarse como una **versión nueva** de dieta del paciente, con el siguiente número de versión, sin sobrescribir la dieta vigente y sin transcripción de audio asociada.

Un paciente sin ninguna dieta anterior SHALL poder generar así su primera versión, siempre que la instrucción aporte lo necesario.

#### Scenario: Retoque confirmado

- **WHEN** el usuario pide subir el hidrato de la cena de un paciente y confirma la propuesta
- **THEN** se guarda una versión nueva de su dieta con ese cambio
- **AND** la versión anterior sigue existiendo sin cambios

#### Scenario: Retoque sin confirmar

- **WHEN** el usuario no confirma la propuesta
- **THEN** el paciente conserva su última dieta como versión más reciente y no se crea ninguna consulta

### Requirement: Renderizar el PDF de una dieta

La herramienta de PDF SHALL recibir una dieta del usuario y devolver un enlace temporal a su PDF de marca, reutilizando el PDF ya guardado mientras siga correspondiendo al documento actual y a la plantilla vigente.

Es una herramienta de escritura cuando el PDF hay que crearlo o rehacerlo: en ese caso SHALL proponerse al usuario antes de renderizarlo y guardarlo. Si el PDF ya existe y sigue vigente, SHALL entregarse directamente.

El enlace SHALL ser temporal y de acceso restringido al usuario: son datos de salud y NO SHALL exponerse ningún enlace público.

Una dieta que no sigue el contrato del documento NO SHALL poder exportarse: la herramienta SHALL explicarlo en español en lugar de devolver un PDF en bruto.

#### Scenario: PDF ya existente

- **WHEN** se pide el PDF de una dieta ya aprobada y sin cambios
- **THEN** el asistente devuelve el enlace temporal sin pedir confirmación

#### Scenario: PDF por crear

- **WHEN** se pide el PDF de una dieta que aún no lo tiene
- **THEN** el asistente propone crearlo y solo lo renderiza y guarda tras la confirmación

#### Scenario: Documento antiguo sin contrato

- **WHEN** se pide el PDF de una dieta guardada antes del contrato del documento
- **THEN** el asistente explica en español que ese documento no se puede exportar
