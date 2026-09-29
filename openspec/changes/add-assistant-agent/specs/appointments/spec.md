# Spec Delta

## Purpose

Guarda la agenda de citas del nutricionista como dato real de la aplicación, de modo que el calendario deje de mostrar datos inventados y se pueda preguntar a quién toca ver en un rango de fechas.

## ADDED Requirements

### Requirement: La agenda es un dato real del usuario

El sistema SHALL guardar las citas del nutricionista de forma persistente. Cada cita SHALL tener fecha y hora de inicio y de fin, un tipo (seguimiento, primera cita, revisión, urgente o bloqueo), un estado (pendiente, completada o cancelada), un paciente opcional y notas opcionales.

Una cita de tipo bloqueo SHALL poder existir sin paciente. Las demás SHALL referirse a un paciente del propio usuario.

Cada usuario SHALL ver y modificar únicamente sus propias citas. Las citas de otro usuario SHALL ser inalcanzables, igual que sus pacientes.

#### Scenario: Cita con paciente

- **WHEN** se registra una cita de revisión para un paciente del usuario
- **THEN** queda guardada con su fecha, hora, tipo, estado y paciente

#### Scenario: Bloqueo de agenda

- **WHEN** se registra un bloqueo sin paciente
- **THEN** queda guardado como cita sin paciente asociado

#### Scenario: Cita de otro usuario

- **WHEN** un usuario intenta leer o modificar una cita que no es suya
- **THEN** el sistema responde como no encontrada y no revela ningún dato de ella

### Requirement: El calendario muestra la agenda real

La vista de calendario SHALL mostrar las citas guardadas del usuario para el mes consultado, y su resumen semanal SHALL calcularse a partir de esas citas. NO SHALL mostrarse ninguna cita de ejemplo ni de relleno.

Un mes sin citas SHALL mostrarse vacío, indicando que no hay citas, en lugar de con datos inventados.

**BREAKING**: el calendario dejará de mostrar la agenda de ejemplo que se veía hasta ahora; arrancará vacío hasta que se registren citas.

#### Scenario: Mes con citas

- **WHEN** el usuario abre el calendario de un mes en el que tiene citas
- **THEN** ve sus citas reales, con su paciente, hora, tipo y estado

#### Scenario: Mes sin citas

- **WHEN** el usuario abre un mes sin ninguna cita registrada
- **THEN** el calendario aparece vacío e indica que no hay citas

### Requirement: Consulta de la agenda por rango y tipo

El sistema SHALL permitir consultar las citas del usuario entre dos fechas, opcionalmente filtradas por tipo y por estado, ordenadas por fecha y hora de inicio, con el paciente de cada cita resuelto a su nombre e identificador.

El rango SHALL interpretarse en la zona horaria local del usuario, de modo que "esta semana" cubra los días naturales de esa semana.

#### Scenario: Revisiones de una semana

- **WHEN** se consultan las citas de tipo revisión entre el lunes y el domingo de una semana
- **THEN** se devuelven solo las citas de revisión de esos días, ordenadas por fecha y hora, con el nombre del paciente

#### Scenario: Rango sin resultados

- **WHEN** no hay ninguna cita en el rango consultado
- **THEN** la consulta devuelve una lista vacía
