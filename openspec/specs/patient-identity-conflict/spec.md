# patient-identity-conflict Specification

## Purpose

Decide qué pasa cuando los datos que una consulta extrae de un paciente nuevo choca con la identidad de un paciente que ya existe: cómo se detecta antes de escribir nada, qué comparación se le entrega al usuario para que distinga cuál de los tres errores posibles ocurrió, y cómo se guarda la dieta ya generada sin volver a pedírsela al modelo.

## Requirements

### Requirement: El choque de identidad se detecta antes de escribir

Cuando la consulta es de un paciente nuevo, el sistema SHALL comprobar si el email extraído ya pertenece a otro paciente del usuario **antes** de intentar crear la ficha.

Si ese email ya está ocupado, el sistema NO SHALL crear ningún paciente, NO SHALL guardar la consulta y NO SHALL modificar la ficha que lo ocupa. La petición SHALL terminar entregando un conflicto de identidad, no un error genérico.

Un email vacío o ausente en lo extraído NO SHALL considerarse un choque: la consulta sigue su curso normal.

La comprobación SHALL hacerse solo entre los pacientes del propio usuario.

#### Scenario: El email dictado ya tiene dueño

- **WHEN** la consulta es de un paciente nuevo y el email extraído ya pertenece a otro paciente del usuario
- **THEN** no se crea ningún paciente ni se guarda la consulta
- **AND** la respuesta entrega un conflicto de identidad
- **AND** la ficha del paciente que ocupa ese email queda intacta

#### Scenario: Consulta sin email

- **WHEN** la consulta es de un paciente nuevo y de ella no se extrae ningún email
- **THEN** no hay conflicto
- **AND** el paciente se crea y la consulta se guarda como siempre

#### Scenario: El email es de un paciente de otro usuario

- **WHEN** el email extraído pertenece a un paciente de otro usuario
- **THEN** no hay conflicto para esta consulta
- **AND** el paciente se crea con ese email

### Requirement: El conflicto entrega la comparación, no un mensaje

El conflicto de identidad SHALL llevar, para que el usuario pueda decidir, los datos relevantes de las dos identidades: nombre y apellidos, edad, email y teléfono, tal y como están en la ficha existente y tal y como se extrajeron del audio.

El conflicto SHALL señalar, campo a campo, si los dos valores coinciden, si difieren o si falta en alguno de los dos lados.

El conflicto SHALL identificar al paciente existente de forma que el usuario pueda abrirlo.

El conflicto NO SHALL incluir la dieta ni el contenido clínico de la consulta: su único cometido es identificar a la persona.

#### Scenario: Mismo nombre, edad distinta

- **WHEN** se entrega un conflicto cuyo nombre coincide y cuya edad difiere
- **THEN** la comparación marca el nombre como coincidente y la edad como distinta
- **AND** muestra los dos valores de edad

#### Scenario: La ficha existente no tiene teléfono

- **WHEN** la ficha existente no tiene teléfono y el audio sí lo dicta
- **THEN** la comparación marca ese campo como ausente en la ficha existente
- **AND** no lo presenta como una discrepancia entre dos valores

### Requirement: La resolución la elige el usuario

La pantalla SHALL mostrar la comparación y ofrecer exactamente tres salidas, correspondientes a los tres errores que un choque de email puede significar:

- **es el mismo paciente**: la consulta y su dieta se asocian al paciente existente, sin crear otro;
- **el email está mal dictado**: se crea el paciente nuevo sin ese email, y la ficha existente no se toca;
- **los datos guardados están mal**: se actualiza la ficha existente con los datos extraídos del audio y la consulta se asocia a ella.

El sistema NO SHALL elegir ninguna de las tres por su cuenta, ni cuando todos los campos comparados coincidan. La asociación de una consulta a un paciente sigue viniendo de una decisión explícita del usuario.

Mientras el conflicto esté sin resolver, la pantalla SHALL advertir de que la dieta todavía no está guardada.

#### Scenario: Todos los campos coinciden

- **WHEN** nombre, apellidos, edad y teléfono coinciden con la ficha existente
- **THEN** la pantalla sigue pidiendo al usuario que elija una de las tres salidas
- **AND** no se guarda nada hasta que elija

#### Scenario: El usuario reconoce al paciente

- **WHEN** el usuario elige "es el mismo paciente"
- **THEN** la consulta y su dieta quedan asociadas al paciente existente
- **AND** el número de pacientes no cambia

#### Scenario: El email estaba mal dictado

- **WHEN** el usuario elige "el email está mal dictado"
- **THEN** se crea un paciente nuevo con los datos del audio y sin email
- **AND** la ficha que ocupaba ese email queda intacta

#### Scenario: La ficha guardada estaba mal

- **WHEN** el usuario elige "los datos guardados están mal"
- **THEN** la ficha existente queda actualizada con los datos extraídos del audio
- **AND** la consulta y su dieta quedan asociadas a ella

### Requirement: La dieta generada no se pierde ni se regenera

Resolver un conflicto SHALL guardar la dieta que ya se generó, sin volver a llamar al modelo de generación.

La resolución SHALL asignar a esa dieta su número de versión dentro del histórico del paciente al que acaba asociada, igual que cualquier otra consulta.

Si la resolución falla, el sistema NO SHALL dar la consulta por guardada, y la pantalla SHALL seguir mostrando la dieta y permitir reintentar.

El sistema NO SHALL garantizar que una dieta pendiente sobreviva al cierre de la pantalla, y la pantalla SHALL decirlo.

#### Scenario: Resolución correcta

- **WHEN** el usuario resuelve un conflicto
- **THEN** la consulta queda guardada con la misma dieta que estaba en pantalla
- **AND** no se ha hecho ninguna llamada al modelo de generación

#### Scenario: Primera dieta del paciente reconocido

- **WHEN** el usuario elige "es el mismo paciente" y ese paciente ya tenía dietas
- **THEN** la dieta guardada recibe el número de versión siguiente a la última de ese paciente

#### Scenario: La resolución falla

- **WHEN** la resolución no puede completarse
- **THEN** la consulta no queda guardada
- **AND** la pantalla sigue mostrando la dieta y un mensaje en español que dice qué hacer

### Requirement: La resolución revalida en el servidor

La ruta que resuelve un conflicto SHALL revalidar la salida elegida, los datos recibidos y la pertenencia del paciente existente al usuario de la sesión. Que un conflicto se haya entregado antes NO SHALL contar como permiso.

Una salida desconocida, una dieta vacía o un paciente que no es del usuario SHALL rechazarse sin escribir nada, con un mensaje en español.

#### Scenario: Paciente de otro usuario en la resolución

- **WHEN** la resolución llega con el identificador de un paciente que no pertenece al usuario
- **THEN** se rechaza sin escribir nada
- **AND** la respuesta lleva un mensaje en español

#### Scenario: Dieta vacía

- **WHEN** la resolución llega sin dieta o con una dieta vacía
- **THEN** se rechaza sin escribir nada
