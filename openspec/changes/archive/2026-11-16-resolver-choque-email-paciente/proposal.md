# Proposal

## Why

Cuando la consulta es de un paciente nuevo y el audio dicta un email que ya tiene otro paciente, el `insert` viola `unique_patient_email_per_user`, el stream muere con una excepción y **la dieta ya generada se descarta**. Medido el 2026-11-14: 86 s de modelo pagados y tirados, con la nutricionista delante del paciente y un audio que no se repite.

El contrato dice lo contrario que la base de datos. `openspec/specs/consultation-patient-selection/spec.md` promete "se crea un paciente nuevo y no se modifica el paciente que ya tenía ese email", y `app/api/process-consultation/route.ts` lo repite en su comentario; el índice único lo impide. Uno de los dos está mal, y es el contrato: **un email identifica a una persona**, así que dos pacientes con el mismo correo no son dos pacientes.

Por eso el choque no es un caso de borde técnico, es una señal: significa uno de tres errores, y el sistema no puede distinguirlos solo. (a) El usuario pulsó "paciente nuevo" cuando ese paciente ya existe. (b) Dictó mal el email y no es el de este paciente nuevo. (c) Los datos guardados del paciente que ocupa ese email están mal. Cada uno se resuelve distinto, y quien sabe cuál es es el usuario.

## What Changes

- **BREAKING (de contrato, no de API):** un paciente nuevo cuyo email ya pertenece a otro paciente **ya no crea una ficha duplicada**. El escenario actual de `consultation-patient-selection` se sustituye: en vez de crear, el servidor devuelve un conflicto con la comparación y la consulta queda sin guardar hasta que el usuario resuelva.
- La detección ocurre **antes de intentar el `insert`**: el servidor busca al dueño de ese email entre los pacientes del usuario y, si existe, no inserta nada.
- El evento de cierre del stream deja de ser solo `done` o `error`: aparece un **conflicto de identidad** que lleva la comparación campo a campo —nombre y apellidos, edad, email, teléfono— entre lo extraído del audio y la ficha que ya ocupa ese email, marcando qué coincide y qué no.
- La pantalla de `/diets` muestra esa comparación y ofrece **tres salidas explícitas**, que son los tres errores: es el mismo paciente / el email está mal dictado / los datos guardados están mal. Nada se decide sin el usuario.
- **La dieta no se pierde.** El markdown ya está en el navegador cuando el stream cierra; al resolver se manda a una ruta que **solo persiste** —crea o reutiliza el paciente según la salida elegida, inserta la consulta con su dieta— y **nunca vuelve a llamar al modelo**.
- El aviso de que la dieta está sin guardar es explícito en pantalla, porque vive en la pestaña: si se cierra antes de resolver, se pierde.

## Capabilities

### New Capabilities

- `patient-identity-conflict`: qué hace el sistema cuando los datos extraídos de una consulta choca con la identidad de un paciente que ya existe — cómo lo detecta antes de escribir, qué comparación entrega, qué salidas ofrece y cómo persiste la dieta ya generada sin regenerarla.

### Modified Capabilities

- `consultation-patient-selection`: el requisito "paciente nuevo crea su ficha" deja de crearla cuando el email ya está ocupado, y el escenario "paciente nuevo con un email ya registrado" cambia de "se crea un paciente nuevo" a "se entrega un conflicto y no se escribe nada". El requisito de no adivinar el paciente por la transcripción **no cambia**: la resolución la elige el usuario, el sistema no empareja solo.

## Impact

- **Reglas duras.** El cliente sigue hablando solo con route handlers (regla 1): la resolución es una ruta nueva bajo `app/api/`, no una Server Action. Nada de sistema de ficheros (regla 2): la dieta pendiente viaja en memoria del navegador y en el cuerpo de la petición.
- **Código.** `app/api/process-consultation/route.ts` (detección antes del `insert`, evento nuevo en el stream), una ruta nueva que solo persiste, `src/components/diets/` (la pantalla de comparación y las tres salidas), `src/models/` (el tipo del conflicto), `src/constants/patient-memory.ts` (los mensajes, en español).
- **Base de datos.** Ninguna migración: `unique_patient_email_per_user` se respeta en lugar de pelearse con él. Si la salida es "los datos guardados están mal", se actualiza la ficha existente; si es "el email está mal dictado", el paciente nuevo se crea sin ese email.
- **Storage.** No se toca. El bucket privado `diets` sigue igual y la dieta solo llega a él por el flujo de aprobación de siempre, con URLs firmadas.
- **Presupuesto de tiempo.** La ruta de resolución no genera, así que le basta el `maxDuration` por defecto; el presupuesto de 180 s de la generación no cambia.
- **Riesgo asumido.** La dieta pendiente vive en la pestaña. Aparcarla en el servidor exigiría una consulta sin paciente —y `patient_consultations.patient_id` es obligatorio—, es decir tabla o columna nuevas; se descarta a propósito para que este cambio sea pequeño.
