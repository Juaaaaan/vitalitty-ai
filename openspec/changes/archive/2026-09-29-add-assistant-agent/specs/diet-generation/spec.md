# Spec Delta

## MODIFIED Requirements

### Requirement: Generación del documento en una sola pasada

El sistema SHALL producir el documento de dieta en una única llamada de generación que reciba en contexto, en este orden: las instrucciones con las reglas nutricionales, al menos una dieta real completa como ejemplo, el contexto del paciente, y **lo dicho para esta dieta**: la transcripción de la consulta, o bien una instrucción en lenguaje natural con el retoque pedido cuando la generación no nace de una consulta grabada. Ambas entradas SHALL producir un documento que cumpla el mismo contrato; una instrucción NO SHALL relajar ninguna regla del documento.

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
