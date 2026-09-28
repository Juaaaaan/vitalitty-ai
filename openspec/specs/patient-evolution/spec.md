# patient-evolution Specification

## Purpose

Muestra en la ficha del paciente cómo han evolucionado, consulta a consulta, las calorías objetivo de su dieta y su peso, para que la nutricionista vea el seguimiento de un vistazo.

## Requirements

### Requirement: Gráfica de evolución por consulta

La ficha del paciente SHALL mostrar una gráfica de evolución con un punto por consulta, en orden cronológico, identificado por su número y su fecha.

La gráfica SHALL mostrar dos series: las calorías objetivo de cada consulta y el peso registrado en cada consulta. Cada serie SHALL tener su propia escala, porque kilocalorías y kilogramos no comparten eje.

Al pasar el cursor por una consulta, el usuario SHALL ver las calorías objetivo y el peso de esa consulta, con sus unidades.

#### Scenario: Paciente con calorías y peso en varias consultas

- **WHEN** el usuario abre la ficha de un paciente con tres consultas que registran calorías objetivo y peso
- **THEN** ve una gráfica con tres consultas en orden cronológico
- **AND** cada consulta muestra sus calorías objetivo y su peso, cada uno en su propia escala

#### Scenario: Consulta sin peso

- **WHEN** una consulta intermedia no tiene peso registrado
- **THEN** la gráfica sigue mostrando sus calorías objetivo
- **AND** la serie de peso no inventa un valor para esa consulta y enlaza solo las consultas que sí lo tienen

#### Scenario: Consulta sin calorías objetivo

- **WHEN** una consulta tiene peso pero no calorías objetivo
- **THEN** la gráfica muestra su peso y no muestra una barra de calorías para esa consulta

### Requirement: Gráfica sin datos

Si ninguna consulta del paciente tiene calorías objetivo ni peso, la ficha NO SHALL mostrar la gráfica de evolución.

#### Scenario: Paciente sin datos que graficar

- **WHEN** ninguna consulta del paciente registra calorías objetivo ni peso
- **THEN** la ficha no muestra la gráfica de evolución
- **AND** el resto de la ficha se muestra con normalidad
