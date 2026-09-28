# consultation-extraction Specification

## Purpose

Extrae de la transcripción de una consulta los campos estructurados del paciente y de la cita que la base de datos necesita para listar, comparar y graficar. Es una proyección secundaria del documento de dieta, nunca el camino por el que se produce.

## Requirements

### Requirement: La extracción no bloquea la entrega del documento

La extracción de campos estructurados SHALL ejecutarse en paralelo a la generación del documento y NO SHALL retrasar la aparición del documento en pantalla.

El documento de dieta SHALL poder mostrarse completo aunque la extracción no haya terminado.

#### Scenario: La extracción tarda más que la generación

- **WHEN** la extracción sigue en curso cuando el documento ya está completo en pantalla
- **THEN** el usuario ve el documento entero sin esperar a la extracción

#### Scenario: La extracción falla

- **WHEN** la extracción falla o devuelve datos inválidos
- **THEN** el documento de dieta se entrega y se guarda igualmente
- **AND** el fallo queda registrado en el servidor sin presentarse al usuario como un fallo de la generación

### Requirement: El documento es la fuente de verdad

Los campos estructurados SHALL ser una proyección de la consulta, no la entrada a partir de la cual se construye el documento. La generación del documento NO SHALL depender del resultado de la extracción.

En caso de discrepancia entre el documento y los campos extraídos, el documento SHALL prevalecer.

#### Scenario: Extracción y documento discrepan

- **WHEN** un campo extraído contradice lo que dice el documento de dieta
- **THEN** el documento se conserva tal cual
- **AND** el campo extraído no reescribe el documento

### Requirement: Campos extraídos de la consulta

El sistema SHALL extraer de la transcripción los datos del paciente y de la consulta que ya se venían registrando, con la misma forma, de modo que las pantallas existentes sigan funcionando sin cambios.

Un campo que no aparece en la transcripción SHALL quedar vacío en lugar de inventarse.

#### Scenario: Transcripción con datos parciales

- **WHEN** la transcripción no menciona el peso del paciente
- **THEN** ese campo queda vacío y no se rellena con un valor inventado
- **AND** los campos que sí aparecen se extraen con normalidad

#### Scenario: Paciente ya existente

- **WHEN** la consulta corresponde a un paciente ya registrado
- **THEN** solo se actualizan los campos que la transcripción aporta
- **AND** los datos previos que la consulta no menciona se conservan
