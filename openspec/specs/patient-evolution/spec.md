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

### Requirement: Evolución de las raciones por dieta

La ficha del paciente SHALL mostrar la evolución de las raciones pautadas en cada dieta, por grupo de alimento, con un punto por dieta en orden cronológico e identificado por su versión y su fecha.

Cada grupo SHALL poder mostrarse u ocultarse. Cuando un grupo se pauta como rango, la gráfica SHALL situar el punto en el centro del rango y el detalle al pasar el cursor SHALL mostrar el rango completo con su unidad.

Una dieta que no pauta un grupo NO SHALL tener punto para ese grupo.

Mientras se preparan las raciones de dietas que aún no las tienen calculadas, la vista SHALL indicarlo y mostrar las ya disponibles. Si la preparación falla, SHALL mostrar "No se pudieron preparar las raciones de algunas dietas. Recarga la página para intentarlo de nuevo." junto con las raciones que sí se tienen.

#### Scenario: Paciente con tres dietas

- **WHEN** el usuario abre la ficha de un paciente con tres dietas que pautan hidrato en comida y en cena
- **THEN** ve la evolución de ambos grupos en las tres dietas
- **AND** puede ocultar uno de los grupos

#### Scenario: Ración pautada como rango

- **WHEN** una dieta pauta cremas de 150 a 200 ml
- **THEN** el punto se sitúa en 175 y el detalle muestra "150-200 ml"

#### Scenario: Dietas sin raciones calculadas

- **WHEN** el paciente tiene dietas guardadas antes de este cambio
- **THEN** la vista indica que está preparando las raciones
- **AND** al terminar las muestra todas sin que el usuario tenga que hacer nada
