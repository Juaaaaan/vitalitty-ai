# Spec Delta

## Purpose

Da a la generación de dietas una memoria persistente por paciente: antes de generar se carga de la base de datos solo lo relevante del paciente (ficha, resúmenes recientes y última dieta) y, al crear cada dieta, se guarda un resumen breve para reutilizarlo en consultas futuras.

## ADDED Requirements

### Requirement: Memoria del paciente existente en cada generación

Antes de generar la dieta de un paciente existente, el sistema SHALL cargar de la base de datos y poner en contexto de la generación:

- la ficha del paciente: datos personales (nombre, edad, género, altura, peso) y, para cada dato clínico y de preferencias (alergias e intolerancias, patologías, medicación, cirugías, suplementación, gustos y preferencias, alimentos a evitar, alimentos a priorizar, objetivo, perfil de actividad), el valor más reciente conocido en sus consultas;
- el resumen de, como máximo, sus 3 consultas más recientes con dieta;
- el documento completo de su última dieta.

Un dato de la ficha que ninguna consulta registró SHALL omitirse, no rellenarse con un valor por defecto.

#### Scenario: Paciente recurrente con intolerancia conocida

- **WHEN** un paciente tiene registrada en una consulta anterior una intolerancia a la lactosa y se genera su dieta a partir de un audio que no la menciona
- **THEN** la dieta generada no incluye lácteos con lactosa
- **AND** el nutricionista no ha tenido que repetir la intolerancia en el audio

#### Scenario: El dato más reciente prevalece

- **WHEN** una consulta antigua registra "evitar pescado azul" y una posterior registra "evitar marisco" en alimentos a evitar
- **THEN** la ficha en contexto muestra el valor de la consulta posterior

#### Scenario: La última consulta no menciona un dato clínico

- **WHEN** la consulta más reciente no registró alergias pero una anterior sí
- **THEN** la ficha en contexto conserva las alergias de la consulta anterior

### Requirement: Seleccionar, no volcar

El contexto del paciente SHALL limitarse a la ficha, los resúmenes de las 3 consultas más recientes con dieta y la última dieta completa. No SHALL incluir el histórico completo de consultas, dietas anteriores a la última ni transcripciones anteriores.

El tamaño del contexto del paciente SHALL estar acotado con independencia del número de consultas que tenga el paciente.

#### Scenario: Paciente con muchas consultas

- **WHEN** se genera la dieta de un paciente con 10 consultas anteriores
- **THEN** el contexto contiene como mucho 3 resúmenes y una sola dieta completa
- **AND** no contiene ninguna transcripción anterior

#### Scenario: Consultas antiguas sin resumen

- **WHEN** alguna de las consultas recientes no tiene resumen guardado
- **THEN** esa consulta se omite de la lista de resúmenes sin que la generación falle

### Requirement: Posición del contexto del paciente en el prompt

El contexto del paciente SHALL ir después del bloque estático cacheado (instrucciones y dietas de ejemplo) y antes de la transcripción de la consulta nueva.

Ningún dato del paciente SHALL formar parte del bloque estático. Las reglas sobre cómo usar la memoria del paciente, al ser iguales para todos, SHALL formar parte del bloque estático.

#### Scenario: Dos pacientes existentes seguidos

- **WHEN** se generan dietas de dos pacientes existentes distintos dentro de la ventana de caché
- **THEN** el bloque estático se sirve desde caché en ambas
- **AND** cada generación ve únicamente la memoria de su paciente

### Requirement: La consulta nueva manda sobre la memoria

La memoria del paciente SHALL tratarse como conocimiento previo, no como orden. Cuando la transcripción nueva contradice un dato de la memoria (por ejemplo, retira una intolerancia o cambia el objetivo), la dieta SHALL seguir la transcripción nueva.

Una intolerancia, alergia o preferencia conocida que la transcripción nueva no menciona SHALL respetarse.

#### Scenario: La consulta retira una restricción

- **WHEN** la memoria indica "evitar gluten" y el nutricionista dicta que el paciente ya tolera el gluten
- **THEN** la dieta generada puede incluir alimentos con gluten

### Requirement: Paciente nuevo sin memoria

Para un paciente nuevo, el contexto de la generación SHALL ser solo el bloque estático y la transcripción de la consulta. No SHALL incluirse datos, resúmenes ni dietas de ningún otro paciente.

#### Scenario: Paciente nuevo con nombre igual al de uno existente

- **WHEN** se elige "paciente nuevo" y el audio dicta un nombre que coincide con el de un paciente ya registrado
- **THEN** la generación no recibe la memoria del paciente registrado

### Requirement: Resumen de consulta guardado con cada dieta

Al guardarse una consulta con su dieta, el sistema SHALL guardar junto a ella un resumen breve de esa consulta (objetivo, cambios decididos, restricciones y preferencias mencionadas, y cualquier dato clínico relevante) para usarlo como memoria en consultas futuras.

El resumen SHALL ser breve y SHALL contener solo lo dicho en la consulta, sin inventar datos.

Si el resumen no puede obtenerse, la consulta y la dieta SHALL guardarse igualmente sin resumen, y la generación no SHALL presentarse al usuario como fallida.

#### Scenario: Dieta completada

- **WHEN** la generación termina y la consulta se guarda
- **THEN** la consulta tiene un resumen breve disponible para la siguiente generación de ese paciente

#### Scenario: Falla la obtención del resumen

- **WHEN** no se puede obtener el resumen de la consulta
- **THEN** la consulta y su dieta se guardan igual
- **AND** el usuario ve la dieta como generada, no como un error
