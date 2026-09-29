# diet-comparison Specification

## Purpose

Permite ver, en la ficha del paciente, qué ha cambiado entre una dieta y la versión anterior del mismo paciente (calorías, peso, raciones y alimentos) y por qué, sin tener que abrir y comparar los dos documentos a mano.

## Requirements

### Requirement: Elegir la dieta a comparar

La ficha del paciente SHALL ofrecer una sección de comparación en la que el usuario elige una versión de dieta N del paciente. La comparación SHALL hacerse siempre entre N y la versión anterior del mismo paciente, que es la versión existente inmediatamente inferior a N.

Solo SHALL poder elegirse versiones que tengan una versión anterior. Por defecto SHALL estar seleccionada la versión más reciente.

Las consultas sin dieta NO SHALL aparecer como opción ni contar como versión anterior.

#### Scenario: Paciente con varias dietas

- **WHEN** el usuario abre la ficha de un paciente con dietas v1, v2 y v3
- **THEN** la sección de comparación ofrece v2 y v3, con v3 seleccionada
- **AND** se muestra la comparación de v3 con v2

#### Scenario: Consulta sin dieta entre dos dietas

- **WHEN** entre la consulta de v2 y la de v3 hay una consulta sin dieta
- **THEN** v3 se compara con v2

#### Scenario: Paciente con una sola dieta

- **WHEN** el paciente tiene solo la dieta v1
- **THEN** la sección muestra "Hace falta una segunda dieta para comparar." y no ofrece ninguna versión

### Requirement: Diferencias de calorías, peso y raciones

La comparación SHALL mostrar, para la versión anterior y para la versión N, las calorías objetivo, el peso registrado en la consulta y las raciones de cada grupo de alimento que pauta la dieta, junto con la diferencia entre ambas.

Las raciones SHALL agruparse en un conjunto fijo de grupos, para que las mismas cosas se comparen entre versiones. Una ración pautada como rango SHALL mostrarse como rango y no como su media.

Si un valor falta en una de las dos versiones, SHALL mostrarse vacío en esa versión y NO SHALL mostrarse ninguna diferencia para ese valor.

#### Scenario: Se bajan las calorías y el hidrato de la cena

- **WHEN** v2 pauta 2100 kcal y 30 g de hidrato en la cena, y v3 pauta 1900 kcal y 20 g
- **THEN** la comparación muestra 2100 → 1900 kcal con −200
- **AND** muestra el hidrato de la cena 30 → 20 g con −10

#### Scenario: Peso no registrado en una consulta

- **WHEN** la consulta de v2 no tiene peso registrado
- **THEN** el peso de v2 aparece vacío y no se muestra diferencia de peso

#### Scenario: Grupo que solo existe en una versión

- **WHEN** v3 pauta frutos secos y v2 no
- **THEN** los frutos secos aparecen vacíos en v2 y con su cantidad en v3, sin diferencia

### Requirement: Alimentos que entran y salen

La comparación SHALL listar los alimentos que aparecen en la versión N y no en la anterior (entran) y los que aparecen en la anterior y no en N (salen), según el contenido de los dos documentos.

Un mismo alimento escrito de forma distinta en las dos versiones NO SHALL contarse como un alimento que sale y otro que entra.

#### Scenario: Se sustituye un alimento

- **WHEN** v2 incluye pan blanco en el desayuno y v3 lo sustituye por avena
- **THEN** la avena aparece en "entran" y el pan blanco en "salen"

#### Scenario: Mismo alimento con otro nombre

- **WHEN** v2 dice "yogur natural" y v3 dice "yogur natural sin azúcar" para el mismo alimento
- **THEN** no aparece ni en "entran" ni en "salen"

### Requirement: Resumen de qué cambió y por qué

La comparación SHALL incluir un resumen breve en español, en lenguaje natural, que explique qué cambió de la versión anterior a la N y por qué.

El qué SHALL basarse solo en los dos documentos de dieta. El por qué SHALL basarse solo en lo dicho en la consulta de la versión N. El resumen NO SHALL inventar motivos. Si la consulta N no deja registrado ningún motivo, el resumen SHALL decirlo explícitamente en lugar de suponer uno.

#### Scenario: Cambio con motivo dicho en consulta

- **WHEN** en la consulta de v3 se dice que se baja el hidrato de la cena porque el paciente no está perdiendo peso
- **THEN** el resumen menciona la bajada del hidrato de la cena y ese motivo

#### Scenario: Cambio sin motivo registrado

- **WHEN** la consulta de v3 no dice por qué se cambian las cantidades
- **THEN** el resumen describe los cambios e indica que en la consulta no consta el motivo

### Requirement: La comparación se calcula una vez

Una comparación ya calculada SHALL guardarse y reutilizarse: abrir otra vez la misma comparación NO SHALL volver a calcularla.

Si la versión anterior de N deja de ser la misma (por ejemplo, porque se ha borrado su consulta), la comparación guardada SHALL descartarse y calcularse de nuevo con la versión anterior actual.

Mostrar la comparación NO SHALL generar de nuevo ninguna dieta ni modificar ningún documento de dieta.

#### Scenario: Segunda apertura

- **WHEN** el usuario abre la comparación de v3, sale de la ficha y la vuelve a abrir
- **THEN** la segunda vez la comparación aparece sin esperar a un nuevo cálculo y con el mismo contenido

#### Scenario: Cambia la versión anterior

- **WHEN** la comparación de v3 se calculó contra v2 y la consulta de v2 se ha borrado
- **THEN** la siguiente apertura compara v3 con v1

### Requirement: Espera y errores

Mientras se calcula la comparación, la sección SHALL indicar que se está preparando, y las diferencias de calorías y peso, que no necesitan cálculo, SHALL mostrarse ya.

Si el cálculo falla, la sección SHALL mostrar "No se pudo preparar la comparación. Vuelve a intentarlo en unos segundos." con un botón para reintentar. Las diferencias de calorías y peso SHALL seguir visibles.

El usuario solo SHALL poder comparar dietas de sus propios pacientes. Pedir la comparación de una consulta ajena o inexistente SHALL responder como no encontrada, sin revelar si existe.

#### Scenario: Primer cálculo

- **WHEN** el usuario selecciona una versión cuya comparación aún no está calculada
- **THEN** ve las diferencias de calorías y peso y un indicador de que el resto se está preparando
- **AND** al terminar ve raciones, alimentos y resumen

#### Scenario: Falla el cálculo

- **WHEN** el cálculo de la comparación falla
- **THEN** el usuario ve "No se pudo preparar la comparación. Vuelve a intentarlo en unos segundos." y un botón de reintentar
- **AND** las diferencias de calorías y peso siguen visibles

#### Scenario: Consulta de otro usuario

- **WHEN** se pide la comparación de una consulta que no pertenece al usuario
- **THEN** la respuesta es de no encontrada y no incluye datos de esa consulta

#### Scenario: Versión sin anterior

- **WHEN** se pide la comparación de la primera dieta de un paciente
- **THEN** la respuesta indica "Esta es la primera dieta del paciente: no hay versión anterior con la que compararla." y no se hace ningún cálculo
