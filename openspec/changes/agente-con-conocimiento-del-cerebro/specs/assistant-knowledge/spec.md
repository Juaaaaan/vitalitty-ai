# Spec Delta

## Purpose

Cómo el asistente se apoya en el conocimiento clínico del Cerebro para responder: qué sabe que existe antes de preguntar, qué puede razonar y qué sigue teniendo que salir de una herramienta, de dónde dice que sale cada cosa, y qué hace cuando el conocimiento no está disponible.

## ADDED Requirements

### Requirement: El asistente sabe qué conocimiento existe antes de preguntar

Al empezar una vuelta de conversación, el sistema SHALL poner a disposición del asistente un índice del conocimiento activo del usuario: por cada documento, su título, su tipo, sus etiquetas y las secciones en que se divide.

El índice SHALL contener únicamente documentos del usuario de la sesión y únicamente su versión activa. Un documento retirado, o uno cuya versión no está activa, NO SHALL aparecer.

El índice SHALL ser un listado, no el contenido: el contenido se obtiene con las herramientas de lectura del conocimiento.

Si el índice no puede obtenerse, la vuelta SHALL continuar sin él.

#### Scenario: Pregunta de criterio sin nombrar el documento

- **WHEN** el usuario pregunta por la suplementación que corresponde a una paciente, sin decir en qué documento mirar
- **THEN** el asistente localiza el material pertinente por su cuenta
- **AND** no le pide al usuario que le diga qué documento consultar

#### Scenario: Documento retirado

- **WHEN** el usuario ha retirado un documento del Cerebro y después pregunta por su tema
- **THEN** el asistente no lo ofrece como fuente
- **AND** responde con lo que sí tiene, diciendo qué no ha encontrado

#### Scenario: Conocimiento de otro usuario

- **WHEN** otro usuario tiene documentos cargados en su propio Cerebro
- **THEN** el índice del asistente no los incluye
- **AND** ninguna herramienta de conocimiento devuelve su contenido

### Requirement: El dato sale de una herramienta; el criterio se razona

El asistente SHALL seguir obteniendo todo **dato** —nombre, peso, calorías, raciones, versión de dieta, fecha de cita— exclusivamente de las herramientas de dominio, y NO SHALL inventarlo ni estimarlo. El conocimiento del Cerebro NO SHALL usarse como fuente de un dato de paciente.

El asistente SHALL poder responder preguntas de **criterio** —qué conviene pautar, cómo repartirlo, por qué una pauta y no otra— razonando sobre el conocimiento recuperado, en lugar de declinar la pregunta por no existir una herramienta que la responda.

Cuando una pregunta de criterio no esté cubierta por ningún documento del usuario, el asistente SHALL decirlo y SHALL distinguir lo que responde por su cuenta de lo que sale del material de la nutricionista. NO SHALL presentar lo propio como si viniera de su Cerebro.

#### Scenario: Pregunta que mezcla dato y criterio

- **WHEN** el usuario pregunta cuánta proteína lleva la dieta actual de una paciente y si es lo adecuado para su objetivo
- **THEN** la cantidad actual sale de la dieta consultada con una herramienta
- **AND** la valoración se apoya en el conocimiento recuperado

#### Scenario: Criterio que el material no cubre

- **WHEN** el usuario pregunta por un tema que ningún documento suyo trata
- **THEN** el asistente dice que no tiene material propio sobre eso
- **AND** si responde, deja claro que es su criterio y no el del Cerebro

#### Scenario: Un dato que no se ha consultado

- **WHEN** el usuario pregunta por el peso de una paciente y el asistente no ha llamado a ninguna herramienta que lo devuelva
- **THEN** no da una cifra
- **AND** consulta la herramienta o dice que no lo sabe

### Requirement: Lo que viene del conocimiento dice de dónde viene

Cuando el asistente apoye una respuesta en el conocimiento del Cerebro, SHALL indicar de qué documento y de qué parte de él sale, de forma que la nutricionista pueda ir a comprobarlo.

La procedencia SHALL darse por su título y su sección. El asistente NO SHALL escribir una URL ni un enlace, igual que con los documentos de dieta.

#### Scenario: Respuesta apoyada en un documento

- **WHEN** el asistente responde a una pregunta de criterio con material del Cerebro
- **THEN** la respuesta dice de qué documento y sección procede

#### Scenario: Varias fuentes

- **WHEN** la respuesta se apoya en dos documentos distintos
- **THEN** cita ambos
- **AND** no atribuye a uno lo que dice el otro

### Requirement: El asistente lee el conocimiento, no lo cambia

El asistente NO SHALL crear, modificar, activar ni retirar un documento de conocimiento ni un prompt. Las herramientas de conocimiento SHALL ser todas de lectura.

Cuando el usuario pida por el asistente un cambio en el Cerebro, el asistente SHALL decir que eso se hace en la sección del Cerebro.

#### Scenario: Petición de editar el Cerebro desde el asistente

- **WHEN** el usuario pide al asistente que añada una pauta a uno de sus documentos
- **THEN** el asistente dice que eso se hace desde el Cerebro
- **AND** ningún documento ni versión queda creado ni modificado

### Requirement: El conocimiento no puede tumbar una vuelta

Un fallo al obtener el índice o al consultar el conocimiento NO SHALL interrumpir la conversación. El asistente SHALL recibirlo como resultado de la herramienta y SHALL responder con lo que sí haya podido consultar, diciendo en español qué parte no ha podido mirar.

Agotado el presupuesto de tiempo de una consulta al conocimiento, la vuelta SHALL continuar sin ese material, no esperar indefinidamente.

#### Scenario: El conocimiento no responde

- **WHEN** la consulta al conocimiento falla y las herramientas de paciente responden
- **THEN** el asistente contesta con los datos del paciente
- **AND** dice que no ha podido consultar su material

#### Scenario: Sin ningún documento cargado

- **WHEN** el usuario no tiene documentos en su Cerebro y hace una pregunta de criterio
- **THEN** el asistente lo dice en vez de dar por hecho que no hay respuesta
- **AND** la conversación continúa
