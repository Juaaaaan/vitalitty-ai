# Spec Delta

## Purpose

Garantiza que cada consulta queda asociada al paciente correcto: el nutricionista declara explícitamente si el paciente es nuevo o existente antes de grabar, sin que el sistema lo adivine a partir de la transcripción, y cada dieta recibe su número de versión dentro del histórico del paciente.

## ADDED Requirements

### Requirement: Elección explícita de paciente antes de grabar

La pantalla de consulta SHALL pedir al usuario que indique, antes de grabar, si la consulta es de un paciente nuevo o de un paciente existente. La grabación SHALL permanecer deshabilitada hasta que la elección esté completa.

Si el usuario indica "paciente existente", SHALL elegir a un paciente concreto de su lista de pacientes antes de poder grabar.

#### Scenario: Usuario abre la pantalla de consulta

- **WHEN** el usuario entra en la pantalla de consulta
- **THEN** ve la elección "paciente nuevo / paciente existente"
- **AND** no puede empezar a grabar hasta haber elegido

#### Scenario: Paciente existente sin seleccionar

- **WHEN** el usuario marca "paciente existente" y no ha elegido ningún paciente
- **THEN** la grabación sigue deshabilitada
- **AND** la pantalla indica "Elige un paciente de la lista para empezar a grabar"

#### Scenario: Cambio de opinión antes de grabar

- **WHEN** el usuario cambia de "existente" a "nuevo" antes de grabar
- **THEN** se descarta el paciente elegido y la consulta se tratará como de un paciente nuevo

### Requirement: Sin adivinar el paciente por la transcripción

El sistema NO SHALL asociar una consulta a un paciente por coincidencias de nombre, email o teléfono en la transcripción, ni en la pantalla ni en el servidor. La asociación SHALL venir únicamente de la elección explícita del usuario.

#### Scenario: Homónimo en el audio

- **WHEN** el usuario elige "paciente existente: Ana García López" y el audio menciona a otra "Ana"
- **THEN** la consulta se asocia a Ana García López y a ningún otro paciente

#### Scenario: Paciente nuevo con un email ya registrado

- **WHEN** el usuario elige "paciente nuevo" y el audio dicta un email que ya tiene otro paciente
- **THEN** se crea un paciente nuevo
- **AND** no se modifica el paciente que ya tenía ese email

### Requirement: Paciente nuevo crea su ficha

Cuando la consulta es de un paciente nuevo, el sistema SHALL crear un paciente nuevo con los datos obtenidos de esa consulta y asociar a él la consulta y la dieta.

Si de la consulta no puede obtenerse al menos el nombre del paciente, la consulta no SHALL guardarse y el usuario SHALL ver el mensaje "No se ha podido identificar el nombre del paciente en el audio. Graba de nuevo diciendo su nombre completo o elige un paciente existente."

#### Scenario: Primera consulta de un paciente

- **WHEN** el usuario elige "paciente nuevo" y la dieta se genera completa
- **THEN** existe un paciente nuevo con los datos dictados
- **AND** la consulta y la dieta quedan asociadas a él

### Requirement: Paciente existente reutiliza su ficha

Cuando la consulta es de un paciente existente, el sistema SHALL asociar la consulta y la dieta al paciente elegido, sin crear otro paciente.

Si el paciente elegido no existe o no pertenece al usuario, la generación no SHALL empezar y el usuario SHALL ver el mensaje "El paciente elegido no existe o no tienes acceso. Recarga la página y vuelve a elegirlo."

#### Scenario: Revisión de un paciente existente

- **WHEN** el usuario elige un paciente existente y la dieta se genera completa
- **THEN** la consulta queda asociada a ese paciente
- **AND** el número de pacientes no cambia

#### Scenario: Paciente de otro usuario

- **WHEN** la petición de generación referencia un paciente que no pertenece al usuario autenticado
- **THEN** no se genera ninguna dieta y no se guarda ninguna consulta

### Requirement: Versión de la dieta por paciente

Cada consulta guardada con dieta SHALL llevar un número de versión dentro de su paciente. La dieta de un paciente nuevo SHALL ser la versión 1. La dieta de un paciente existente SHALL ser la versión N+1, siendo N la versión más alta que ya tenga ese paciente.

Dos consultas del mismo paciente NO SHALL compartir número de versión.

#### Scenario: Primera dieta

- **WHEN** se guarda la dieta de un paciente nuevo
- **THEN** su versión es 1

#### Scenario: Tercera dieta de un paciente

- **WHEN** un paciente tiene dietas con versiones 1 y 2 y se guarda una nueva
- **THEN** la nueva dieta es la versión 3

#### Scenario: Consultas anteriores al versionado

- **WHEN** un paciente tiene consultas con dieta guardadas antes de existir el versionado
- **THEN** esas consultas tienen versiones asignadas por orden de creación
- **AND** la siguiente dieta continúa la numeración
