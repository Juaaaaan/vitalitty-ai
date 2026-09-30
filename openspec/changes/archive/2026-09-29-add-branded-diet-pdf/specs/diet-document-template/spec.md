# Spec Delta

## Purpose

Define la forma visual con la que se presenta el documento de dieta: qué secciones
del contrato reconoce la plantilla de marca, qué elementos fijos aparecen en cada
página y cómo se comporta ante documentos que no siguen el contrato.

## ADDED Requirements

### Requirement: Contrato del documento de dieta

El documento de dieta SHALL empezar por un frontmatter con exactamente estos
campos: `paciente`, `version`, `proxima_revision` y `calorias`.

El cuerpo SHALL usar este conjunto cerrado de secciones, en este orden:
`## Objetivos`, `## Suplementación`, `## Cantidades`, `## Pre/Post-entreno`,
`## Plan semanal` y `## Observaciones`.

Dentro de `## Plan semanal`, cada subsección SHALL encabezarse con el nombre de un
día (`### Lunes`, opcionalmente seguido de `: actividad`) o con un turno
(`### Turno mañana`, `### Turno tarde`), y SHALL contener las comidas marcadas como
`**COMIDA**`, `**MERIENDA**` y `**CENA**`.

El documento NO SHALL contener gramos de macronutrientes: las cantidades se
expresan por grupo de alimento, como en `## Cantidades`.

#### Scenario: Documento conforme al contrato

- **WHEN** se presenta un documento con frontmatter completo y secciones del contrato
- **THEN** la plantilla reconoce cada sección y la sitúa en el lugar que le
  corresponde en el diseño

#### Scenario: Día con actividad

- **WHEN** una subsección del plan semanal se encabeza `### Lunes: actividad`
- **THEN** se presenta como día de la semana, conservando la anotación de actividad
  junto al nombre del día

#### Scenario: Plan por turnos en vez de por días

- **WHEN** las subsecciones del plan semanal se encabezan `### Turno mañana` y
  `### Turno tarde`
- **THEN** se presentan como turnos y no como días de la semana
- **AND** no hace falta ningún campo adicional en el frontmatter para distinguirlo

### Requirement: Presentación de marca fija e idéntica entre dietas

La plantilla SHALL aportar la totalidad del diseño: portada, logo, paleta,
tipografías, cabecera y pie. El documento SHALL aportar únicamente el contenido.

La portada SHALL mostrar el logo de Vitalitty entre dos reglas horizontales, el
icono de Instagram con `@vitalittynutri` debajo, y el nombre del paciente tomado
del frontmatter. La portada NO SHALL llevar pie.

El resto de páginas SHALL mostrar el logo arriba a la derecha y un pie fijo,
repetido en todas ellas, con el texto literal de las condiciones de cambio de cita,
la versión de la dieta, la fecha y el número de página.

Dos documentos con contenido distinto SHALL producir la misma portada, el mismo
logo, la misma paleta, las mismas tipografías y el mismo pie. Solo SHALL diferir lo
que proviene del contenido.

Ningún elemento de marca SHALL depender de que el documento lo incluya: ni el
logo, ni el `@` de Instagram, ni el texto del pie SHALL poder generarse ni
sobrescribirse desde el documento.

#### Scenario: Dos dietas distintas

- **WHEN** se presentan dos documentos de dieta con contenidos diferentes
- **THEN** portada, logo, paleta, tipografías y pie son idénticos entre ambas
- **AND** solo cambia el contenido y el nombre del paciente

#### Scenario: El documento intenta aportar marca

- **WHEN** un documento incluye un logo, un `@` de Instagram o un texto de pie en su
  markdown
- **THEN** la presentación final no lo duplica ni lo deja sustituir al de la
  plantilla

#### Scenario: Paginación

- **WHEN** el contenido de una dieta ocupa varias páginas
- **THEN** cada página distinta de la portada muestra su número de página en el pie

### Requirement: El pie nunca se solapa con el contenido

El contenido SHALL disponer de un margen inferior mayor que la altura del pie, de
modo que en ninguna página el pie se superponga a texto de la dieta.

Un bloque de día o de turno del plan semanal NO SHALL partirse entre dos páginas
dejando sus comidas separadas del encabezado.

#### Scenario: Contenido que llega al borde inferior

- **WHEN** el contenido de una página llega hasta la zona baja de la hoja
- **THEN** el texto salta a la página siguiente antes de alcanzar el pie
- **AND** ninguna línea de la dieta queda tapada por el pie

#### Scenario: Día a caballo entre dos páginas

- **WHEN** un día del plan semanal no cabe entero en lo que resta de página
- **THEN** el día completo pasa a la página siguiente, con su encabezado y sus
  comidas juntos

### Requirement: Ninguna ingesta del documento se pierde

Dentro de un día o turno del plan semanal, toda etiqueta de ingesta que el
documento escriba SHALL aparecer en la presentación junto a su contenido,
cualquiera que sea su nombre y aunque lleve la hora u otra anotación.

El sistema NO SHALL descartar una ingesta por no pertenecer a un conjunto
predefinido de nombres.

Un día del plan semanal con ingestas en el documento NO SHALL presentarse solo
con su encabezado.

#### Scenario: Etiquetas con hora y nombres propios del caso

- **WHEN** un día contiene `**PRIMERA INGESTA (11:00)**`, `**COMIDA (15:00)**`,
  `**POST-PÁDEL (22:40)**` y `**PRE-CAMA (00:30)**`
- **THEN** las cuatro aparecen en la presentación, cada una sobre su contenido

#### Scenario: Ningún día vacío

- **WHEN** se presenta un documento cuyo plan semanal tiene ingestas en todos
  sus días
- **THEN** ningún día aparece solo con su encabezado

### Requirement: Tolerancia ante documentos que no siguen el contrato

La plantilla SHALL renderizar las secciones del contrato que estén presentes, en el
orden del contrato, y SHALL omitir sin dejar hueco las que falten.

Una sección que no pertenezca al contrato NO SHALL recibir una maqueta inventada.

Un documento sin frontmatter SHALL presentarse como markdown crudo, sin plantilla
de marca, y NO SHALL ofrecerse su exportación a PDF.

#### Scenario: Dieta sin suplementación

- **WHEN** un documento conforme al contrato no incluye `## Suplementación`
- **THEN** la presentación omite esa sección sin dejar un espacio vacío ni un título
  huérfano

#### Scenario: Consulta anterior al contrato

- **WHEN** se abre una dieta guardada antes de este cambio, sin frontmatter
- **THEN** se muestra su markdown crudo
- **AND** no se ofrece descargar un PDF de ella

#### Scenario: Sección desconocida

- **WHEN** un documento incluye una sección que no está en el contrato
- **THEN** la plantilla no le asigna un bloque de diseño propio ni altera por ello
  la maqueta del resto

### Requirement: La presentación funciona sin acceso al sistema de ficheros

Los recursos de marca — logo, icono de Instagram y tipografías — SHALL estar
disponibles en tiempo de ejecución sin leer del sistema de ficheros y sin depender
de una petición a un servicio externo durante el render.

Si un recurso de marca no estuviera disponible, el sistema NO SHALL producir un
documento con tipografías o imágenes de reserva silenciosamente: SHALL fallar con
un mensaje en español que indique qué recurso falta.

#### Scenario: Render en un entorno sin ficheros

- **WHEN** se presenta un documento en el entorno de despliegue serverless
- **THEN** el logo y las tipografías de marca aparecen correctamente
- **AND** no se ha leído ningún fichero del disco ni descargado nada de un tercero

### Requirement: Una sola plantilla para pantalla y para PDF

La vista previa en pantalla y el documento exportado SHALL proceder de la misma
plantilla.

Un cambio en la plantilla SHALL verse reflejado a la vez en ambas salidas, sin
mantener dos maquetaciones separadas.

#### Scenario: Comparar vista previa y exportación

- **WHEN** se compara la vista previa de una dieta con su documento exportado
- **THEN** ambos muestran las mismas secciones, en el mismo orden, con los mismos
  elementos de marca
