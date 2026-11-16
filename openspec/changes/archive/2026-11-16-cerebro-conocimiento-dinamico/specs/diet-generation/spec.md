# Spec Delta

## MODIFIED Requirements

### Requirement: Generación del documento en una sola pasada

El sistema SHALL producir el documento de dieta en una única llamada de generación que reciba en contexto, en este orden: las instrucciones con las reglas nutricionales, los documentos de conocimiento que apliquen al paciente, al menos una dieta real completa como ejemplo, el contexto del paciente, y **lo dicho para esta dieta**: la transcripción de la consulta, o bien una instrucción en lenguaje natural con el retoque pedido cuando la generación no nace de una consulta grabada. Ambas entradas SHALL producir un documento que cumpla el mismo contrato; una instrucción NO SHALL relajar ninguna regla del documento.

Las instrucciones que entran en contexto SHALL ser la versión activa del prompt de generación de dieta del usuario, resuelta al arrancar la generación. Si no hay versión activa, o si no se puede resolver, SHALL usarse las instrucciones por defecto del código: la ausencia de contenido editable NO SHALL impedir generar.

Los documentos de conocimiento son un añadido al contexto, no una condición: una generación sin ningún documento seleccionado SHALL completarse igual.

Ni las instrucciones recuperadas ni los documentos de conocimiento SHALL relajar el contrato del documento. Un documento de conocimiento NO SHALL introducir secciones, campos de frontmatter ni gramos de macronutrientes que el contrato no admita.

La salida SHALL ser el documento de dieta en markdown, ya formateado y listo para mostrar, sin pasos intermedios de extracción a estructura fija ni relleno de plantilla.

La estructura del documento generado SHALL ajustarse al contrato del documento de
dieta: un frontmatter con `paciente`, `version`, `proxima_revision` y `calorias`,
seguido de las secciones `## Objetivos`, `## Suplementación`, `## Cantidades`,
`## Pre/Post-entreno`, `## Plan semanal` y `## Observaciones`, en ese orden, con los
días o turnos del plan semanal como subsecciones y sus comidas marcadas como
`**COMIDA**`, `**MERIENDA**` y `**CENA**`.

El documento NO SHALL incluir gramos de macronutrientes: las cantidades se expresan
por grupo de alimento.

Las dietas de ejemplo que entran en contexto SHALL cumplir ese mismo contrato: el
documento generado se parece a los ejemplos, así que un ejemplo que no lo cumpla
produce salidas que la plantilla no reconoce.

El sistema NO SHALL emitir secciones ajenas al contrato. Una sección del contrato
que la consulta no justifique SHALL omitirse en lugar de rellenarse con contenido
inventado.

#### Scenario: Consulta transcrita de un paciente nuevo

- **WHEN** se solicita la generación para una transcripción de consulta y un paciente sin dieta anterior
- **THEN** el sistema devuelve un documento de dieta en markdown
- **AND** empieza por el frontmatter con `paciente`, `version`, `proxima_revision` y `calorias`
- **AND** sus secciones son las del contrato, en el orden del contrato
- **AND** el contenido refleja lo dicho en la transcripción, no valores de relleno

#### Scenario: Retoque pedido como instrucción

- **WHEN** se solicita la generación para un paciente con dieta anterior dando una instrucción en lenguaje natural en lugar de una transcripción
- **THEN** el documento resultante parte de la dieta anterior y aplica solo lo pedido
- **AND** cumple el mismo contrato, con el mismo frontmatter y las mismas secciones

#### Scenario: La consulta no encaja en la estructura habitual

- **WHEN** la transcripción describe un caso que no cubre alguna sección del contrato
- **THEN** el documento omite esa sección en lugar de rellenarla con contenido
  inventado
- **AND** no introduce secciones fuera del contrato para encajar el caso

#### Scenario: Plan por turnos

- **WHEN** la consulta describe un plan organizado por turnos y no por días de la semana
- **THEN** las subsecciones del plan semanal se encabezan como turnos
- **AND** el frontmatter no cambia por ello

#### Scenario: La dieta no prescribe macronutrientes

- **WHEN** se genera cualquier documento de dieta
- **THEN** las cantidades aparecen por grupo de alimento
- **AND** el documento no contiene gramos de macronutrientes ni un campo de macros
  en el frontmatter

#### Scenario: Instrucciones editadas desde el Cerebro

- **WHEN** existe una versión activa del prompt de generación de dieta distinta de las instrucciones por defecto
- **THEN** la generación usa esa versión activa
- **AND** el documento resultante sigue cumpliendo el contrato

#### Scenario: Sin instrucciones editables disponibles

- **WHEN** no hay versión activa del prompt de generación de dieta, o no se puede resolver
- **THEN** la generación se completa con las instrucciones por defecto del código
- **AND** el documento resultante cumple el contrato igualmente

#### Scenario: Documentos de conocimiento en contexto

- **WHEN** la generación de un paciente selecciona documentos de conocimiento aplicables
- **THEN** su contenido entra en contexto antes del contexto del paciente
- **AND** el documento generado sigue teniendo solo las secciones del contrato

### Requirement: Orden del prompt y caché del bloque estático

El contenido que no varía entre consultas — instrucciones, documentos de conocimiento seleccionados y dietas de ejemplo — SHALL ocupar el principio del prompt y SHALL marcarse para caché, en ese orden. El contenido específico de la consulta — contexto del paciente y transcripción — SHALL ir después, fuera del prefijo cacheado.

El bloque estático SHALL ser idéntico byte a byte entre peticiones mientras no se active una versión nueva de un prompt o de un documento seleccionado. No SHALL contener marcas de tiempo, identificadores de petición, ni ningún valor que cambie entre llamadas, y el orden de los documentos dentro del bloque SHALL ser determinista.

Activar una versión nueva SHALL invalidar el prefijo cacheado a propósito: la primera generación posterior paga una llamada en frío y las siguientes vuelven a aprovechar la caché. Esa invalidación NO SHALL requerir un despliegue ni ninguna acción adicional.

#### Scenario: Segunda generación dentro de la ventana de caché

- **WHEN** se lanza una generación y poco después otra distinta
- **AND** entre ambas no se ha activado ninguna versión nueva en el Cerebro
- **THEN** la segunda reutiliza el bloque estático desde caché en lugar de volver a facturarlo íntegro

#### Scenario: Cambia el contexto del paciente

- **WHEN** dos generaciones consecutivas son de pacientes distintos
- **AND** ambas seleccionan el mismo prompt activo y los mismos documentos
- **THEN** el bloque estático se sigue sirviendo desde caché
- **AND** solo el contexto de paciente y la transcripción se facturan como entrada nueva

#### Scenario: Se activa una versión nueva entre dos generaciones

- **WHEN** entre dos generaciones se activa una versión nueva del prompt de generación o de un documento que la selección incluye
- **THEN** la primera generación posterior no encuentra el bloque estático en caché y lo factura íntegro
- **AND** las generaciones siguientes, sin más cambios, vuelven a servirlo desde caché
- **AND** no ha hecho falta ningún despliegue para que el cambio surta efecto
