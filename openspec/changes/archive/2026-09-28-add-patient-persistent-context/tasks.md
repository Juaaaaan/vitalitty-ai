# Tasks

## 1. Esquema: versión y resumen

- [x] 1.1 Crear `supabase/migrations/<timestamp>_add_diet_version_and_summary.sql` con `diet_version integer`, `consultation_summary text`, índice único parcial `(patient_id, diet_version) where diet_version is not null`, trigger `before insert` con `pg_advisory_xact_lock` por paciente y relleno por `row_number()` de las filas con `diet_md` (design D6). Verificar aplicándola en una rama de Supabase y consultando que las filas existentes tienen versiones 1..N por paciente sin huecos.
- [x] 1.2 Verificar el trigger en la rama con SQL: dos `insert` con `diet_md` del mismo paciente reciben N+1 y N+2; un `insert` sin `diet_md` queda con `diet_version` null; un insert con versión duplicada falla por el índice.
- [x] 1.3 Añadir `diet_version` y `consultation_summary` a `ConsultationData` en `src/models/extraction/extraction.models.ts`. Verificar con `npx tsc --noEmit`.

> Nota 1.1–1.2 (2026-09-28): por decisión del usuario, la migración se aplicó directamente al proyecto (`20260928213458`), no en una rama. Relleno verificado: versiones 1..13 sin huecos en el único paciente con dietas. Trigger verificado dentro de un bloque abortado a propósito (sin filas residuales): 14 y 15, `null` sin `diet_md`, duplicado rechazado por el índice.

## 2. Extracción: resumen de consulta

- [x] 2.1 Añadir `consultation_summary` (string | null) a `CONSULTATION_PROPERTIES` y las reglas del resumen (3–6 frases, solo lo dicho, objetivo/cambios/restricciones/datos clínicos) al prompt de `consultation-extraction-service.ts`. Verificar con un test en `src/services/__tests__/consultation-extraction-service.test.ts` que el schema enviado exige el campo y que un `null` del modelo se devuelve como `null`.
- [x] 2.2 Verificar contra la API real con una transcripción de prueba que menciona subida de proteína e intolerancia a la lactosa: el resumen contiene ambas y no inventa patologías (scenario "Consulta con cambios y restricciones").

## 3. Memoria del paciente

- [x] 3.1 Crear `src/models/patient-context/patient-memory.models.ts` con los tipos `PatientMemory` (ficha, resúmenes, última dieta) y `PatientMode`. Verificar con `npx tsc --noEmit`.
- [x] 3.2 Crear `buildPatientMemory()` pura en `src/services/patient-context-service.ts` con `PATIENT_MEMORY_SUMMARY_LIMIT = 3` en `src/constants/`. Verificar con tests en `src/services/__tests__/patient-context-service.test.ts`: último valor no nulo gana; un dato ausente en la última consulta se conserva de una anterior; arrays vacíos cuentan como vacíos; como mucho 3 resúmenes; consultas sin resumen se omiten; nunca incluye transcripciones.
- [x] 3.3 Crear `loadPatientMemory(supabase, patientId)` con las tres lecturas en `Promise.all` (design D3), sin seleccionar `diet_md` ni `audio_transcription` en la lectura de consultas. Verificar con un test con cliente Supabase simulado que las columnas pedidas son las ligeras y que un paciente inexistente devuelve `null`.

## 4. Prompt de generación

- [x] 4.1 Añadir la sección `## MEMORIA DEL PACIENTE` (respetar intolerancias/preferencias conocidas, la transcripción nueva manda, los resúmenes son contexto) a `INSTRUCTIONS` en `diet-generation-service.ts`. Verificar con un test que `STATIC_PROMPT_BLOCK` sigue siendo idéntico entre dos construcciones y no contiene ningún dato de paciente.
- [x] 4.2 Sustituir `renderPatientContext` por un render de `PatientMemory` y cambiar `DietGenerationInput` para recibir `memory: PatientMemory | null`. Verificar con tests de `buildDietGenerationRequest`: orden `system` cacheado → memoria → modo revisión + dieta anterior → transcripción; paciente nuevo (`memory: null`) solo lleva la transcripción en `messages`; el render es determinista para la misma entrada; un único `cache_control`.
- [x] 4.3 Medir con `messages.count_tokens` el nuevo `STATIC_PROMPT_BLOCK` y un bloque de memoria típico (ficha completa + 3 resúmenes) y anotar las cifras en `design.md` D4. Verificar que el bloque estático sigue por encima del mínimo cacheable del modelo.

## 5. Route handler

- [x] 5.1 Cambiar el cuerpo de `POST /api/process-consultation` a `{ transcription, patientMode, patientId? }` con `400` para modo ausente/inválido o `existing` sin id, y `404` con el mensaje de la spec cuando `loadPatientMemory` devuelve `null`, todo antes de lanzar extracción o generación. Verificar con tests en `app/api/process-consultation/__tests__/route.test.ts` que en esos casos no se llama a ningún modelo.
- [x] 5.2 Pasar la memoria a `streamDietGeneration` solo en modo `existing`. Verificar con un test que en modo `new` la generación recibe `memory: null` aunque llegue `patientId`.
- [x] 5.3 Reescribir `persist()`: `new` inserta siempre (sin emparejado por email), `existing` actualiza la fila elegida; guarda `consultation_summary`; lee `diet_version` del `returning`; si `new` no trae nombre, lanza el error con el mensaje de la spec. Añadir `dietVersion` al evento `done`. Verificar con tests: un email ya existente en modo `new` no toca otra fila; `done` lleva `dietVersion`; extracción `null` guarda sin resumen y sin error.
- [x] 5.4 Ejecutar `npm run lint` y `npm run test` y verificar que pasan.

## 6. Pantalla /diets

- [x] 6.1 Añadir prop `disabled` a `src/components/audio/audio-recorder.tsx` que impide empezar a grabar. Verificar con un test de componente que el botón de grabar está deshabilitado con `disabled`.
- [x] 6.2 Crear `src/components/patients/patient-picker.tsx` sobre `Command` + `Popover` (sin tocar `src/components/ui/`), con opciones que muestran nombre + email/teléfono y usan el `id` como clave. Verificar con un test que dos homónimos aparecen como dos opciones y que elegir uno devuelve su `id`.
- [x] 6.3 En `app/diets/page.tsx`: selector "Paciente nuevo / Paciente existente" + `PatientPicker` antes del grabador; grabación deshabilitada hasta completar la elección con el aviso "Elige un paciente de la lista para empezar a grabar"; eliminar `findMatchingPatients` y la tarjeta de coincidencias; enviar `patientMode`/`patientId`; mostrar la versión recibida en `done`. Mantener `patientInfoData` en `useMemo` (regla dura 3). Verificar con tests en `app/diets/__tests__/page.test.tsx`: grabación deshabilitada sin elección; el body enviado lleva `patientMode` y `patientId`; no hay búsqueda por nombre en la transcripción.
- [x] 6.4 Ejecutar `npm run lint` y `npm run test` y verificar que pasan.

## 7. Verificación integrada en navegador

> Evidencia previa a 7.2, no la sustituye (2026-09-28): generación real con `claude-opus-5`, memoria sintética con intolerancia a la lactosa y una transcripción que no la menciona. En la semana completa todos los lácteos salen "sin lactosa" o de soja, y los alimentos a evitar de la ficha aparecen en la lista de evitar. 36.9 s, 3558 tokens de salida, `cacheCreationInputTokens` 4215 (primera llamada tras cambiar el bloque estático).

- [ ] 7.1 En navegador (`npm run dev`), paciente nuevo: elegir "nuevo", grabar con nombre y una intolerancia a la lactosa, generar. Verificar que se crea un paciente, la pantalla muestra versión 1 y la fila tiene `consultation_summary`.
- [ ] 7.2 Criterio de aceptación: mismo paciente como "existente", grabar un audio que **no** menciona la lactosa y pide otro cambio. Verificar que la dieta no incluye lácteos con lactosa, aplica el cambio pedido, y la pantalla muestra versión 2.
- [ ] 7.3 Homónimo: con dos pacientes del mismo nombre, elegir uno como existente y generar. Verificar que la consulta queda asociada solo al elegido y que el otro no cambia.
- [ ] 7.4 Revisar el log `Diet generation usage` de las generaciones 7.1–7.2: la segunda lee el bloque estático de caché (`cacheReadInputTokens` > 0) y la duración total queda por debajo de `maxDuration`. Anotar tiempos en `design.md`.
- [x] 7.5 Actualizar `CLAUDE.md` (contrato de `POST /api/process-consultation`, `/diets`, sección Current state vs target) y verificar que no contradice `openspec/project.md`.
