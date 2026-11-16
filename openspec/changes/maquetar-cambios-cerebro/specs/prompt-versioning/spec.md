# Spec Delta

## MODIFIED Requirements

### Requirement: Histórico con diferencias y restauración

El sistema SHALL mostrar el histórico completo de versiones de un prompt, en orden, con su número, su fecha y su nota de cambio.

El sistema SHALL permitir comparar una versión con la anterior. Cómo se presenta esa comparación —qué se muestra, qué se pliega y cómo se llega a cada cambio— lo fija `brain-version-diff`, que es el mismo contrato para prompts y para documentos de conocimiento.

Restaurar una versión antigua SHALL crear una versión nueva con el contenido de la antigua y NO SHALL reescribir el historial ni reutilizar un número de versión ya usado. La versión restaurada SHALL quedar sujeta al mismo paso de activación explícita que cualquier otra.

#### Scenario: Comparar dos versiones consecutivas

- **WHEN** el usuario abre el histórico de un prompt y pide ver una versión frente a la anterior
- **THEN** ve señaladas las diferencias entre las dos, conforme a `brain-version-diff`

#### Scenario: Restaurar una versión anterior

- **WHEN** el usuario restaura la versión 3 de un prompt que ya va por la 7
- **THEN** se crea la versión 8 con el contenido de la 3
- **AND** las versiones 1 a 7 siguen intactas en el histórico
- **AND** la versión activa no cambia hasta que el usuario active la 8
