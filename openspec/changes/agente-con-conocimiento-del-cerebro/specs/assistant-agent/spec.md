# Spec Delta

## MODIFIED Requirements

### Requirement: El asistente solo actúa a través de herramientas de dominio

El asistente SHALL obtener todo dato de paciente exclusivamente a través del catálogo cerrado de herramientas de dominio. El sistema NO SHALL exponerle consultas SQL, acceso a ficheros, ejecución de comandos ni ninguna vía de acceso libre a la base de datos.

Toda ejecución de herramienta SHALL hacerse con la identidad del usuario de la sesión, de modo que un paciente de otro usuario sea inalcanzable aunque el asistente pida su identificador.

Si el asistente pide una herramienta que no existe o con argumentos inválidos, el sistema SHALL devolverle el error como resultado de esa herramienta, sin interrumpir la conversación, y el asistente SHALL poder corregir o explicar que no puede hacerlo.

Cuando lo pedido sea una **acción** que ninguna herramienta cubre, el asistente SHALL decir que no puede hacerla en lugar de inventar que la ha hecho.

Una **pregunta** no es una acción fuera del catálogo. Que ninguna herramienta devuelva una respuesta ya hecha NO SHALL ser motivo para declinarla: si el conocimiento del usuario la cubre, el asistente SHALL responderla conforme a `assistant-knowledge`, distinguiendo el dato —que sigue saliendo de una herramienta— del criterio.

#### Scenario: Petición fuera del catálogo

- **WHEN** el usuario pide algo que ninguna herramienta cubre, como borrar un paciente
- **THEN** el asistente responde que no puede hacerlo desde el asistente
- **AND** no se modifica ningún dato

#### Scenario: Pregunta de criterio sin herramienta que la responda

- **WHEN** el usuario pregunta por qué conviene una pauta y no otra, y ninguna herramienta devuelve esa respuesta
- **THEN** el asistente no declina la pregunta
- **AND** la responde apoyándose en el conocimiento del Cerebro, diciendo de dónde sale

#### Scenario: Identificador de otro usuario

- **WHEN** el asistente solicita datos de un paciente que no pertenece al usuario de la sesión
- **THEN** la herramienta responde como no encontrado
- **AND** la respuesta no revela ningún dato de ese paciente

#### Scenario: Argumentos inválidos

- **WHEN** el asistente llama a una herramienta con un argumento que falta o no es válido
- **THEN** recibe un error descriptivo como resultado de la herramienta
- **AND** la conversación continúa
