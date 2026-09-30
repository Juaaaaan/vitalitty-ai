# Spec Delta

## ADDED Requirements

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
