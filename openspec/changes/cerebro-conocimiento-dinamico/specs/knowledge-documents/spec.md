# Spec Delta

## Purpose

Guarda el conocimiento clínico del nutricionista — suplementación, recetarios, papers, protocolos — como documentos markdown versionados y etiquetados, para que puedan entrar en contexto en una generación sin pasar por el código ni por el sistema de ficheros.

## ADDED Requirements

### Requirement: Un documento por tema, con metadata que permita filtrarlo

El sistema SHALL mantener documentos de conocimiento identificados por un `slug` estable, con un título legible, un `tipo` de un conjunto cerrado (al menos `suplementacion`, `recetario`, `paper`, `protocolo`, `otro`) y una lista de etiquetas libre.

Cada documento SHALL tener en todo momento, como máximo, una versión marcada como activa, y SHALL poder marcarse como de inclusión incondicional — un documento que entra en toda generación independientemente del paciente.

El `tipo` y las etiquetas SHALL ser editables sin crear una versión nueva del contenido: describen el documento, no son su contenido.

Un documento SHALL ser visible únicamente para el usuario que lo creó.

#### Scenario: Listado filtrable

- **WHEN** el usuario abre la pestaña Documentación del Cerebro
- **THEN** ve sus documentos con su tipo, sus etiquetas y su versión activa
- **AND** puede filtrarlos por tipo y por etiqueta

#### Scenario: Cambiar las etiquetas de un documento

- **WHEN** el usuario añade una etiqueta a un documento ya existente
- **THEN** el cambio queda aplicado sin crear una versión nueva de contenido
- **AND** el documento pasa a ser seleccionable por esa etiqueta en la siguiente generación

#### Scenario: Documento de inclusión incondicional

- **WHEN** el usuario marca un protocolo como de inclusión incondicional
- **THEN** el listado lo señala como tal
- **AND** queda disponible para entrar en toda generación, sea quien sea el paciente

### Requirement: Solo se admite markdown

El sistema SHALL aceptar el contenido de un documento de conocimiento únicamente en markdown, con extensión `.md`.

El rechazo de un fichero que no sea `.md` SHALL producirse en el cliente, antes de subir nada, **y** SHALL revalidarse en el servidor: el sistema NO SHALL confiar en la validación del cliente, porque una petición puede llegar sin pasar por él.

El sistema NO SHALL intentar convertir un `.pdf`, un `.docx` ni ningún otro formato. La conversión es trabajo de otro cambio.

El mensaje de rechazo SHALL decir en español qué hacer: subir el documento en formato Markdown (`.md`).

Un documento vacío NO SHALL aceptarse.

#### Scenario: El usuario arrastra un PDF

- **WHEN** el usuario suelta un fichero `.pdf` en la zona de subida
- **THEN** el cliente lo rechaza antes de subirlo
- **AND** muestra un mensaje que pide subir el documento en formato Markdown (.md)
- **AND** no se crea ningún documento ni ninguna versión

#### Scenario: Petición directa con un formato no admitido

- **WHEN** llega al servidor una petición de subida cuyo contenido no es markdown
- **THEN** el servidor la rechaza con un error en español
- **AND** no se guarda nada

#### Scenario: Subida correcta de un .md

- **WHEN** el usuario sube un `.md` y rellena su tipo y sus etiquetas
- **THEN** el documento queda creado con su versión 1
- **AND** aparece en el listado con esa metadata

#### Scenario: Fichero .md vacío

- **WHEN** el usuario sube un `.md` sin contenido
- **THEN** el sistema lo rechaza diciendo que el documento está vacío

### Requirement: Versionado solo-inserción del contenido

Subir contenido nuevo para un documento existente SHALL crear una versión nueva con número consecutivo, y NO SHALL modificar ni borrar ninguna versión ya creada.

Crear una versión NO SHALL activarla: igual que en los prompts, guardar y activar son acciones distintas.

Activar una versión SHALL mover el puntero de versión activa del documento, sin reescribir el historial, y SHALL surtir efecto en la siguiente generación sin despliegue.

Restaurar una versión antigua SHALL crear una versión nueva con su contenido, sujeta al mismo paso de activación.

#### Scenario: Nueva versión de un recetario

- **WHEN** el usuario sube una corrección del recetario sobre el documento que ya existe
- **THEN** se crea la versión siguiente con ese contenido
- **AND** la versión activa sigue siendo la anterior hasta que la active

#### Scenario: Activar una versión de documento

- **WHEN** el usuario activa la versión nueva del recetario
- **AND** a continuación se lanza una generación que selecciona ese documento
- **THEN** la generación recibe el contenido de la versión recién activada

#### Scenario: Restaurar una versión de documento

- **WHEN** el usuario restaura una versión antigua de un documento
- **THEN** se crea una versión nueva con ese contenido
- **AND** el historial anterior queda intacto

### Requirement: Aviso cuando el conjunto activo crece demasiado

El sistema SHALL avisar al usuario cuando el tamaño conjunto de los documentos de inclusión incondicional supere un umbral definido, porque ese conjunto entra entero en todas las generaciones y encarece la primera llamada tras cada cambio.

El aviso SHALL ser informativo: NO SHALL impedir activar ni marcar un documento.

#### Scenario: Demasiado conocimiento marcado como incondicional

- **WHEN** el usuario marca documentos de inclusión incondicional hasta superar el umbral de tamaño
- **THEN** la pestaña Documentación muestra un aviso de que el conjunto activo es grande y afecta al coste de la generación
- **AND** la acción se completa igualmente
