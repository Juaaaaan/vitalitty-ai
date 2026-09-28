# Proposal

## Why

Cada dieta se genera casi en frío: el modelo solo ve nombre, edad, género, talla y peso, más la última dieta. Las intolerancias, alergias, medicación y preferencias que el nutricionista ya dictó en consultas anteriores viven en columnas de `patient_consultations` que nunca vuelven al prompt, así que hay que repetirlas en cada audio o la dieta nueva las ignora. Además el paciente se "adivina" buscando trozos del nombre en la transcripción, lo que produce homónimos y duplicados — y un paciente mal resuelto arrastra la memoria de otro.

Es la pieza que convierte el núcleo en un "Proyecto" con memoria por paciente, que es justo lo que la arquitectura objetivo dice que la app aporta por encima de un Proyecto: BD por paciente e histórico.

## What Changes

- **Selección explícita de paciente antes de grabar.** `/diets` pregunta "paciente nuevo / paciente existente" antes de habilitar la grabación; si es existente, se elige de la lista. Se elimina la búsqueda por coincidencia de nombre, email o teléfono en la transcripción.
- **BREAKING (contrato interno):** `POST /api/process-consultation` pasa de `{ transcription, existingPatientId? }` a `{ transcription, patientMode: "new" | "existing", patientId? }`. Solo lo llama `/diets`.
- **Se elimina el emparejado implícito por email** en el servidor: "nuevo" crea siempre una fila en `patients`; "existente" reutiliza siempre el `patient_id` elegido.
- **Memoria persistente del paciente en el prompt** (solo pacientes existentes): ficha (datos personales + campos clínicos y de preferencias más recientes conocidos) + resumen breve de las últimas 3 consultas con dieta + la última dieta completa, en modo revisión.
- **Seleccionar, no volcar:** nunca se inyecta el histórico completo; el número de resúmenes es una constante acotada.
- **Resumen de consulta guardado al crear cada dieta**, para reutilizarlo como memoria en consultas futuras.
- **Versión de dieta por paciente:** paciente nuevo → versión 1; existente → versión N+1.
- Instrucciones estáticas nuevas (dentro del bloque cacheado) que dicen al modelo cómo usar la memoria: respetar intolerancias y preferencias conocidas salvo que la consulta las cambie expresamente.
- Migración de esquema: columnas para resumen y versión en `patient_consultations`, con relleno de versión para las filas existentes.

Reglas y arquitectura que motivan o restringen el cambio:

- **Orden del prompt para caché:** el bloque de paciente va **después** del bloque estático cacheado y **antes** de la transcripción. Nada del paciente entra en el prefijo cacheado. Las reglas de uso de la memoria sí van en el bloque estático, porque son idénticas para todos.
- **Documento-primero:** el resumen es memoria auxiliar, no sustituye al markdown ni reescribe la dieta. La última dieta completa sigue siendo la referencia del modo revisión.
- **Regla dura 1:** la carga de contexto ocurre en el route handler; el cliente sigue usando `fetch` a `/api/*`, sin Server Actions.
- **Regla dura 3:** el selector de paciente y la tabla de ficha en `/diets` mantienen `data`/`columns` con referencia estable.
- **Vercel serverless:** la generación ya ronda 44–53 s contra `maxDuration = 60`; el cambio no puede añadir una llamada de modelo secuencial después del stream.

Storage: no se toca. El bucket `diets` sigue privado, con políticas por carpeta `{user_id}/…` y URLs firmadas.

## Capabilities

### New Capabilities

- `patient-context`: memoria persistente del paciente — qué se carga de la BD antes de generar, cómo se selecciona (ficha + últimas N consultas + última dieta), dónde se coloca en el prompt y qué resumen se guarda al crear cada dieta.
- `consultation-patient-selection`: elección explícita de paciente nuevo o existente antes de grabar, sin adivinar por la transcripción, y versionado de la dieta resultante.

### Modified Capabilities

- `diet-generation`: la persistencia al cerrar el stream guarda también versión y resumen; el contexto del paciente deja de ser solo datos personales y el modo revisión se apoya en la memoria.
- `consultation-extraction`: la extracción produce además el resumen breve de la consulta, en paralelo y sin bloquear el documento.

## Impact

- `app/diets/page.tsx` — selector nuevo/existente previo a la grabación; se retira `findMatchingPatients` y la tarjeta de "coincidencias".
- `app/api/process-consultation/route.ts` — nuevo cuerpo de petición, validación, carga de memoria, versión y resumen en `persist`.
- `src/services/diet-generation-service.ts` — render del bloque de memoria e instrucciones estáticas de uso.
- `src/services/patient-context-service.ts` (nuevo) — consultas a Supabase y selección de la memoria.
- `src/services/consultation-extraction-service.ts` — campo de resumen en el schema.
- `src/models/` — tipos de memoria y de la petición.
- `supabase/migrations/` — `diet_version` y `consultation_summary` en `patient_consultations`.
- Coste: +~1–2k tokens de entrada no cacheados por generación de paciente existente. El bloque estático cambia una vez (invalida la caché una sola vez).
