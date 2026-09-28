# Spec Delta

## ADDED Requirements

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
