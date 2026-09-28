# audio-transcription Specification

## Purpose

Convierte el audio grabado de una consulta de nutrición en texto fiel, con especial exigencia en nombres de alimentos y cantidades numéricas, ya que ese texto es la entrada de toda la extracción de datos y la generación de dieta posteriores.

## Requirements

### Requirement: Transcripción de audio de consulta

El sistema SHALL aceptar un audio de consulta y devolver su transcripción en texto plano. La transcripción SHALL realizarse con el modelo `gpt-4o-transcribe`, con idioma fijado a español y parámetros deterministas (temperatura 0), de modo que la misma entrada produzca la misma salida.

La fidelidad en nombres de alimentos y en cantidades numéricas SHALL ser al menos igual a la obtenida con el modelo anterior (`whisper-1`) sobre el mismo audio.

#### Scenario: Audio de consulta válido

- **WHEN** se envía un audio de consulta en español dentro del límite de tamaño admitido
- **THEN** el sistema devuelve la transcripción en texto plano junto con un estado de éxito
- **AND** los nombres de alimentos y las cantidades numéricas pronunciados aparecen en el texto con al menos la misma fidelidad que con el modelo anterior

#### Scenario: Determinismo

- **WHEN** se transcribe dos veces el mismo audio sin cambios de configuración
- **THEN** el sistema devuelve el mismo texto en ambas ocasiones

#### Scenario: Petición sin audio

- **WHEN** se solicita una transcripción sin adjuntar ningún audio
- **THEN** el sistema rechaza la petición indicando que falta el audio, sin llamar al proveedor de transcripción

### Requirement: Límite de tamaño del audio de entrada

El sistema SHALL rechazar cualquier audio que supere los 10 MB **antes** de enviarlo al proveedor de transcripción. El rechazo SHALL identificarse como un error de tamaño de entrada, distinguible de un fallo del proveedor, y SHALL incluir un mensaje en español que indique al usuario que la grabación es demasiado larga y debe dividirse o repetirse.

Un audio de exactamente 10 MB o menos SHALL aceptarse y procesarse con normalidad.

#### Scenario: Audio por encima del límite

- **WHEN** se envía un audio de más de 10 MB
- **THEN** el sistema rechaza la petición con un error de tamaño de entrada
- **AND** no se realiza ninguna llamada al proveedor de transcripción
- **AND** el mensaje devuelto explica en español que la grabación excede el tamaño admitido y qué hacer

#### Scenario: Audio justo en el límite

- **WHEN** se envía un audio de exactamente 10 MB
- **THEN** el sistema lo acepta y procede a transcribirlo

### Requirement: Punto único de transcripción

Todo consumo de transcripción dentro de la aplicación SHALL resolverse a través de un único punto de entrada de servidor, de forma que la elección de modelo, el idioma, los parámetros de determinismo y la validación de tamaño queden definidos en un solo lugar. No SHALL existir más de una ruta de código que invoque al proveedor de transcripción.

Los client components SHALL acceder a la transcripción únicamente mediante un route handler HTTP, nunca mediante Server Actions.

#### Scenario: Cambio de configuración de transcripción

- **WHEN** se modifica el modelo, el idioma o los parámetros de transcripción en el punto único de entrada
- **THEN** el cambio aplica a todos los consumidores de transcripción de la aplicación sin editar ningún otro punto de llamada

#### Scenario: Consumo desde el cliente

- **WHEN** un client component necesita transcribir el audio de una consulta
- **THEN** lo hace mediante una petición HTTP al route handler de transcripción

### Requirement: Forma estable de la respuesta de transcripción

La respuesta de transcripción SHALL exponer siempre un campo de texto. En caso de éxito contiene la transcripción; en caso de error contiene una cadena vacía y se acompaña de un mensaje de error. Los consumidores existentes SHALL seguir funcionando sin cambios en el camino de éxito.

#### Scenario: Fallo del proveedor de transcripción

- **WHEN** el proveedor de transcripción falla o no responde
- **THEN** el sistema devuelve un error acompañado de un campo de texto vacío
- **AND** el detalle del fallo queda registrado en el servidor
