# Spec Delta

## Purpose

Permite al nutricionista corregir el documento de una consulta antes de aprobarlo,
y define qué efecto tiene esa corrección sobre la vista previa y sobre un PDF ya
existente.

## ADDED Requirements

### Requirement: El documento de una consulta se puede corregir

El sistema SHALL permitir al usuario editar el documento markdown de una consulta
suya y guardar el resultado.

El documento guardado SHALL sustituir por completo al anterior: sigue siendo la
fuente de verdad de la dieta.

La edición NO SHALL crear una consulta nueva ni consumir un número de versión: es
la misma dieta, corregida.

Un usuario NO SHALL poder editar el documento de una consulta que no le pertenece.

#### Scenario: Corregir una cena

- **WHEN** el usuario cambia el texto de una cena y guarda
- **THEN** el documento de esa consulta queda actualizado
- **AND** su número de versión no cambia

#### Scenario: Documento vacío

- **WHEN** se intenta guardar un documento vacío
- **THEN** el sistema lo rechaza con un mensaje en español que pide escribir el
  contenido de la dieta
- **AND** el documento anterior se conserva intacto

#### Scenario: Consulta de otro usuario

- **WHEN** se intenta editar el documento de una consulta de otro usuario
- **THEN** el sistema responde en español que no se encuentra la consulta
- **AND** no se modifica nada

### Requirement: La vista previa refleja la corrección sin generar PDF

Tras guardar una corrección, la vista previa SHALL mostrar el documento corregido
con la plantilla de marca aplicada.

Refrescar la vista previa NO SHALL producir ni actualizar ningún PDF.

#### Scenario: Editar y volver a mirar

- **WHEN** el usuario corrige el documento y vuelve a la vista previa
- **THEN** ve el documento corregido, ya maquetado con la plantilla
- **AND** no se ha creado ni modificado ningún PDF

#### Scenario: Varias correcciones seguidas

- **WHEN** el usuario corrige y previsualiza varias veces antes de aprobar
- **THEN** cada vista previa refleja la última versión guardada
- **AND** sigue sin existir PDF de esa dieta

### Requirement: Una corrección invalida el PDF anterior

Si una consulta ya tenía PDF y su documento se corrige, el PDF guardado SHALL
dejar de considerarse válido.

La siguiente petición del PDF de esa consulta SHALL entregar un documento generado
a partir del texto corregido, nunca el anterior.

#### Scenario: Corregir después de aprobar

- **WHEN** el usuario corrige el documento de una dieta que ya se había aprobado
- **AND** vuelve a pedir su PDF
- **THEN** el PDF que recibe corresponde al documento corregido

### Requirement: Flujo de generación con aprobación explícita

La pantalla de generación SHALL seguir este orden: generar el documento y guardarlo
como borrador, mostrar su vista previa, permitir corregirlo, y solo entonces
permitir aprobarlo.

La descarga a disco del usuario SHALL corresponder únicamente al documento aprobado.
Ningún paso anterior SHALL descargar ficheros.

#### Scenario: Recorrido completo

- **WHEN** el usuario genera una dieta, la corrige y la aprueba
- **THEN** en los pasos de generación, vista previa y corrección no se descarga nada
- **AND** al aprobar puede descargar el documento definitivo

#### Scenario: Abandonar antes de aprobar

- **WHEN** el usuario genera una dieta y sale sin aprobarla
- **THEN** el documento queda guardado como borrador en la consulta
- **AND** no queda ningún fichero descargado ni ningún PDF almacenado
