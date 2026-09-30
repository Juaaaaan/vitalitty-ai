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

### Requirement: Resumen breve de la consulta

Junto con los campos estructurados, la extracción SHALL producir un resumen breve de la consulta en texto: objetivo, cambios decididos respecto al plan anterior, restricciones y preferencias mencionadas y datos clínicos relevantes.

El resumen SHALL construirse solo con lo dicho en la transcripción, SHALL ser breve (unas pocas frases) y NO SHALL incluir datos que no aparezcan en ella.

Obtener el resumen NO SHALL retrasar la aparición del documento en pantalla. Si falla, SHALL aplicarse el mismo tratamiento que al fallo de la extracción: la consulta se guarda sin resumen y el fallo solo queda registrado en el servidor.

#### Scenario: Consulta con cambios y restricciones

- **WHEN** la transcripción dice que se sube la proteína y que el paciente ha desarrollado intolerancia a la lactosa
- **THEN** el resumen menciona la subida de proteína y la intolerancia a la lactosa

#### Scenario: Consulta sin datos clínicos nuevos

- **WHEN** la transcripción no menciona patologías, medicación ni intolerancias
- **THEN** el resumen no menciona ninguna

#### Scenario: La extracción falla

- **WHEN** la extracción falla
- **THEN** la consulta se guarda con el documento y sin resumen
- **AND** el usuario no ve un error de generación

### Requirement: Peso registrado por consulta

Cuando la transcripción dicta el peso del paciente, el sistema SHALL guardar ese peso en la propia consulta, además de usarlo como último peso conocido del paciente.

Si la transcripción no dicta el peso, el peso de la consulta SHALL quedar vacío. NO SHALL copiarse el de otra consulta ni el último peso conocido del paciente.

El peso de consultas anteriores NO SHALL cambiar cuando se guarda una consulta nueva.

#### Scenario: Consulta que dicta el peso

- **WHEN** la transcripción de la consulta dice que el paciente pesa 80,5 kg
- **THEN** la consulta queda guardada con un peso de 80,5 kg
- **AND** el último peso conocido del paciente pasa a ser 80,5 kg

#### Scenario: Consulta que no dicta el peso

- **WHEN** la transcripción no menciona el peso y el último peso conocido del paciente es 82 kg
- **THEN** la consulta queda guardada sin peso
- **AND** el último peso conocido del paciente sigue siendo 82 kg

#### Scenario: El histórico no se reescribe

- **WHEN** un paciente con una consulta de 82 kg tiene una consulta nueva de 80,5 kg
- **THEN** la consulta anterior sigue registrando 82 kg

### Requirement: Recuperación del peso de consultas anteriores

El peso de las consultas guardadas antes de este cambio SHALL recuperarse a partir de su transcripción guardada, con las mismas reglas que una consulta nueva: se usa el peso dictado y, si no hay ninguno, el valor queda vacío.

La recuperación SHALL modificar solo el peso de la consulta. NO SHALL alterar ningún otro campo de la consulta ni del paciente, y SHALL poder repetirse sin cambiar el resultado de las consultas que ya tienen peso.

#### Scenario: Consulta antigua con peso dictado

- **WHEN** una consulta anterior al cambio tiene una transcripción que dice "pesa 78 kilos"
- **THEN** tras la recuperación la consulta registra 78 kg
- **AND** el resto de sus campos no cambia

#### Scenario: Consulta antigua sin transcripción o sin peso

- **WHEN** una consulta anterior al cambio no tiene transcripción o su transcripción no dicta el peso
- **THEN** tras la recuperación la consulta sigue sin peso

#### Scenario: Recuperación repetida

- **WHEN** la recuperación se ejecuta por segunda vez
- **THEN** las consultas que ya tenían peso no se vuelven a procesar ni cambian
