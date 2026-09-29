# Spec Delta

## Purpose

Gobierna el ciclo de vida del PDF de una dieta: cuándo se crea, dónde se guarda,
cuándo se reutiliza el guardado, cuándo se regenera y cómo se entrega al usuario
sin exponer datos de salud.

## ADDED Requirements

### Requirement: El PDF solo existe cuando el usuario aprueba la dieta

El sistema NO SHALL producir un PDF durante la generación de la dieta ni al
mostrar su vista previa.

El PDF SHALL producirse únicamente cuando el usuario aprueba explícitamente el
documento.

Mientras una dieta no se haya aprobado, la ficha del paciente NO SHALL ofrecer PDF
para esa consulta.

#### Scenario: Generar y previsualizar

- **WHEN** el usuario genera una dieta y la revisa en la vista previa
- **THEN** no se ha creado ningún PDF ni se ha subido nada a almacenamiento

#### Scenario: Aprobar la dieta

- **WHEN** el usuario aprueba el documento
- **THEN** el sistema produce el PDF, lo guarda y lo deja disponible para descargar

#### Scenario: Consulta con dieta sin aprobar

- **WHEN** se abre la ficha de un paciente con una consulta cuya dieta no se aprobó
- **THEN** esa consulta no ofrece ver ni descargar PDF

### Requirement: El PDF guardado se reutiliza mientras el documento no cambie

Cada consulta SHALL registrar la ruta de su PDF y una huella que identifique
tanto el documento como la versión de la plantilla con la que se generó.

Cuando se pide el PDF de una consulta, si existe uno guardado y su huella coincide
con la del documento actual, el sistema SHALL entregar el PDF guardado sin volver a
renderizarlo.

Si no existe PDF guardado, o su huella no coincide con la actual, el sistema
SHALL renderizarlo de nuevo, sustituir el guardado y actualizar tanto la ruta
como la huella.

Un cambio en la plantilla SHALL invalidar los PDF guardados, sin intervención
manual sobre las consultas ya aprobadas.

#### Scenario: Segunda descarga sin cambios

- **WHEN** se pide por segunda vez el PDF de una dieta que no se ha modificado
- **THEN** se entrega el PDF ya guardado
- **AND** no se vuelve a renderizar

#### Scenario: Documento modificado después de aprobar

- **WHEN** se pide el PDF de una dieta cuyo documento se editó después de generarlo
- **THEN** el sistema renderiza un PDF nuevo a partir del documento actual
- **AND** sustituye el guardado y actualiza la huella

#### Scenario: La plantilla cambia y el documento no

- **WHEN** se corrige la plantilla y se pide el PDF de una dieta que no se ha
  tocado
- **THEN** el sistema entrega un PDF renderizado con la plantilla corregida
- **AND** no hace falta editar la consulta ni borrar el fichero anterior

#### Scenario: Consulta sin PDF previo

- **WHEN** se aprueba una dieta que nunca tuvo PDF
- **THEN** se renderiza, se guarda y quedan registradas su ruta y su huella

### Requirement: Almacenamiento privado del PDF

El PDF SHALL guardarse en el bucket privado existente de dietas, junto al documento
markdown de la misma consulta, bajo una ruta que incluya el usuario, el paciente y
la consulta.

La consulta SHALL guardar la **ruta** del fichero, nunca sus bytes ni una URL
permanente.

El acceso al PDF SHALL hacerse siempre mediante un enlace firmado de validez
limitada emitido por el servidor. El sistema NO SHALL exponer nunca una URL pública
del fichero: son datos de salud.

Un usuario NO SHALL poder obtener el PDF de una consulta que no le pertenece.

#### Scenario: Descargar el PDF

- **WHEN** el usuario pide el PDF de una de sus consultas
- **THEN** recibe un enlace firmado que caduca
- **AND** el enlace no es una URL pública del almacenamiento

#### Scenario: Consulta de otro usuario

- **WHEN** se pide el PDF de una consulta que pertenece a otro usuario
- **THEN** el sistema responde que no se encuentra la consulta, en español
- **AND** no entrega ningún enlace

### Requirement: La ficha de paciente sirve el PDF guardado, no lo regenera

La ficha de paciente SHALL ofrecer, por cada consulta con PDF, la opción de verlo o
descargarlo.

La ficha de paciente NO SHALL renderizar PDF: solo sirve el guardado.

Las consultas sin PDF SHALL indicarlo en lugar de ofrecer una descarga que falle.

#### Scenario: Histórico con dietas aprobadas

- **WHEN** se abre la ficha de un paciente con varias consultas aprobadas
- **THEN** cada una ofrece ver o descargar su PDF

#### Scenario: Consulta anterior a este cambio

- **WHEN** la consulta es anterior a este cambio y solo tiene markdown
- **THEN** la ficha muestra su documento sin ofrecer PDF

### Requirement: Errores de exportación comprensibles

Si la exportación falla, el sistema SHALL informar en español de qué ha fallado y
qué puede hacer el usuario, y NO SHALL dejar registrada una ruta de PDF que no
exista.

Un documento sin frontmatter NO SHALL poder exportarse: el sistema SHALL explicar
que esa dieta es anterior al formato con plantilla y que solo está disponible como
markdown.

#### Scenario: Fallo al renderizar

- **WHEN** el render del PDF falla
- **THEN** el usuario ve un mensaje en español que explica que no se pudo generar el
  PDF y que puede reintentarlo
- **AND** la consulta conserva la ruta y la huella que tuviera antes, o ninguna

#### Scenario: Intento de exportar una dieta antigua

- **WHEN** se intenta exportar una dieta sin frontmatter
- **THEN** el sistema explica en español que esa dieta es anterior al formato con
  plantilla y que solo puede consultarse como markdown
