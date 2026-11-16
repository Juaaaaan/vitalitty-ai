# Spec Delta

## MODIFIED Requirements

### Requirement: Sin adivinar el paciente por la transcripción

El sistema NO SHALL asociar una consulta a un paciente por coincidencias de nombre, email o teléfono en la transcripción, ni en la pantalla ni en el servidor. La asociación SHALL venir únicamente de la elección explícita del usuario.

Comparar los datos extraídos con una ficha existente para **enseñárselos al usuario** no es adivinar: el sistema puede detectar que el email dictado ya tiene dueño y presentar la comparación, pero NO SHALL asociar la consulta a ese paciente sin que el usuario lo decida.

#### Scenario: Homónimo en el audio

- **WHEN** el usuario elige "paciente existente: Ana García López" y el audio menciona a otra "Ana"
- **THEN** la consulta se asocia a Ana García López y a ningún otro paciente

#### Scenario: Paciente nuevo con un email ya registrado

- **WHEN** el usuario elige "paciente nuevo" y el audio dicta un email que ya tiene otro paciente
- **THEN** no se crea ningún paciente y la consulta no se guarda
- **AND** se entrega un conflicto de identidad con la comparación entre las dos fichas
- **AND** no se modifica el paciente que ya tenía ese email
- **AND** la asociación definitiva espera a que el usuario elija cómo resolverlo

### Requirement: Paciente nuevo crea su ficha

Cuando la consulta es de un paciente nuevo, el sistema SHALL crear un paciente nuevo con los datos obtenidos de esa consulta y asociar a él la consulta y la dieta.

Si de la consulta no puede obtenerse al menos el nombre del paciente, la consulta no SHALL guardarse y el usuario SHALL ver el mensaje "No se ha podido identificar el nombre del paciente en el audio. Graba de nuevo diciendo su nombre completo o elige un paciente existente."

Si el email obtenido de la consulta ya pertenece a otro paciente del usuario, el sistema NO SHALL crear la ficha: un email identifica a una persona, así que ese choque significa un error y se resuelve como conflicto de identidad, con la dieta ya generada a salvo.

#### Scenario: Primera consulta de un paciente

- **WHEN** el usuario elige "paciente nuevo" y la dieta se genera completa
- **THEN** existe un paciente nuevo con los datos dictados
- **AND** la consulta y la dieta quedan asociadas a él

#### Scenario: El email dictado ya está ocupado

- **WHEN** el usuario elige "paciente nuevo", la dieta se genera completa y el email dictado ya pertenece a otro paciente del usuario
- **THEN** no se crea ninguna ficha
- **AND** la dieta sigue disponible para guardarla al resolver el conflicto
