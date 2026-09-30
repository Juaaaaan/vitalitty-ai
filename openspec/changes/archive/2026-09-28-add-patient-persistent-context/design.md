# Design

## Context

Ver `proposal.md` — Why. Requisitos en `specs/patient-context`, `specs/consultation-patient-selection` y los deltas de `diet-generation` y `consultation-extraction`.

Estado actual, verificado en código y en el esquema real de Supabase (no supuesto):

```
app/diets/page.tsx
  grabar → POST /api/transcribe → findMatchingPatients(transcripción)   ← adivina por nombre/email/teléfono
  confirmar → POST /api/process-consultation { transcription, existingPatientId? }
                 ├─ patients: id, name_surnames, age, gender, height, weight
                 ├─ última patient_consultations.diet_md                   ← modo revisión
                 ├─ extractConsultationData(transcription)  (Haiku, paralelo)
                 └─ streamDietGeneration  (Opus, system cacheado + messages)
              persist(): si no hay existingPatientId y la extracción trae mail → se funde con el paciente de ese mail
```

- `patients` solo tiene datos personales. **Todo lo clínico y de preferencias** (`alergias_intolerancias`, `patologias`, `medicacion`, `cirugias`, `suplementos`, `gustos_preferencias`, `alimentos_evitar`, `alimentos_priorizar`, `objetivo_*`, `actividad_fisica_perfil`…) vive por consulta en `patient_consultations`. Hoy nada de eso vuelve al prompt.
- `patient_consultations` no tiene columna de versión ni de resumen. Hay filas con `diet_md` ya guardadas.
- Ambas tablas tienen RLS activado con propiedad `created_by = auth.uid()`; el route handler usa el cliente de sesión del usuario, así que una lectura de un paciente ajeno devuelve vacío.
- El `ComboBox` de `src/components/layout/app-comboBox.tsx` usa `name_surnames` como valor de `cmdk`: dos homónimos colisionan. No sirve tal cual para desambiguar.

Restricciones de Vercel serverless que condicionan el enfoque:

- **Tiempo de ejecución:** una dieta completa tarda 44–53 s contra `maxDuration = 60`. No cabe una llamada de modelo **secuencial** más después del stream. Todo lo nuevo o corre antes del stream en paralelo y es barato (lecturas de BD), o corre en paralelo a la generación.
- **Tamaño de body:** el cliente sigue mandando solo la transcripción y la elección de paciente; la memoria se carga en servidor. El body no crece.
- **Sin filesystem:** las instrucciones de uso de la memoria son una constante TypeScript dentro del bloque estático.

## Goals / Non-Goals

**Goals:**

- Una función pura, testeable sin red, que convierta filas de BD en el bloque de memoria del prompt.
- Coste de contexto acotado por constante, independiente del tamaño del histórico.
- Cero latencia añadida al primer token más allá de unas lecturas de BD en paralelo.

**Non-Goals:**

- Fusionar o deduplicar pacientes ya duplicados en la BD.
- Mostrar la memoria o los resúmenes en la ficha del paciente (`/dashboard/patient/[id]`); solo se guardan.
- Generar resúmenes retroactivos para consultas antiguas. Las que no tienen resumen se omiten (spec).
- Comparación de versiones entre sí; la versión solo se numera y se muestra.

## Decisions

### D1 — La elección de paciente viaja explícita en la petición

`POST /api/process-consultation` recibe `{ transcription, patientMode: "new" | "existing", patientId? }`.

- `patientMode` ausente o inválido → `400`.
- `existing` sin `patientId` → `400`.
- `existing` con un `patientId` que no devuelve fila (no existe o RLS lo oculta) → `404` con el mensaje de la spec, **antes** de abrir el stream y de lanzar extracción o generación.
- `new` ignora `patientId` si viene.

`persist()` pierde la rama de emparejado por email: `new` inserta siempre, `existing` actualiza siempre la fila elegida.

_Alternativa descartada:_ mantener `existingPatientId?` y deducir "nuevo" de su ausencia. Es exactamente la ambigüedad que el cambio quita: un `undefined` por un bug del cliente se convertiría en paciente duplicado en silencio. Un modo explícito hace que ese bug sea un `400`.

_Alternativa descartada:_ mantener el emparejado por email como "red de seguridad". Contradice la elección explícita del usuario y funde pacientes distintos que comparten email (familias, un email de tutor).

### D2 — Selector antes de grabar, con componente propio que desambigua

En `/diets`, encima del grabador: dos botones excluyentes "Paciente nuevo" / "Paciente existente" y, si es existente, un selector de pacientes. `AudioRecorder` recibe un prop `disabled` y no graba hasta que la elección está completa. La tarjeta de "coincidencias" y `findMatchingPatients` desaparecen; el botón de generar pasa a "Generar dieta" sin elección posterior.

El selector es un componente nuevo (`src/components/patients/patient-picker.tsx`) sobre los primitivos `Command` + `Popover` ya instalados. Cada opción muestra nombre + email/teléfono y usa el `id` como clave y como parte del valor de `cmdk`, para que dos homónimos sean dos entradas distintas y distinguibles.

Regla dura 3: la tabla de ficha del paciente sigue alimentándose de un `useMemo` sobre el paciente elegido; la lista del selector sale del estado `patients`, que ya es estable.

_Alternativa descartada:_ reutilizar `ComboBox`. Colisiona con homónimos (clave = nombre) y cambiarlo afecta a otros usos.

_Alternativa descartada:_ preguntar después de transcribir, como hoy. El usuario pidió explícitamente elegir antes de grabar, y elegir después invita a dejarse llevar por la sugerencia automática.

### D3 — Carga de memoria: tres lecturas en paralelo, selección en función pura

Nuevo `src/services/patient-context-service.ts`:

- `loadPatientMemory(supabase, patientId)` lanza en `Promise.all`:
  1. la fila de `patients`;
  2. las consultas del paciente con **solo columnas ligeras** (campos clínicos y de preferencias, `consultation_summary`, `diet_version`, `created_at`), ordenadas por `created_at` desc — sin `diet_md` ni `audio_transcription`;
  3. el `diet_md` de la consulta más reciente con dieta (`limit 1`).
- `buildPatientMemory(patient, consultations, lastDietMd)` — pura:
  - ficha: datos personales + para cada campo clínico, el primer valor no nulo y no vacío recorriendo de la más reciente a la más antigua;
  - resúmenes: los de las `PATIENT_MEMORY_SUMMARY_LIMIT = 3` consultas más recientes con dieta que tengan resumen, con su versión y fecha;
  - última dieta: tal cual.

La carga se hace **antes** de abrir el stream, porque la memoria entra en el prompt. Son lecturas indexadas por `patient_id`; su coste es de decenas de ms, frente a los ~4–5 s hasta el primer resumen de pensamiento.

_Alternativa descartada:_ ficha = solo la última consulta. Si la última no repitió las alergias, se perderían: es precisamente el fallo del criterio de aceptación.

_Alternativa descartada:_ materializar una "ficha clínica" en `patients` (columnas nuevas o un `jsonb`) actualizada en cada consulta. Duplica la verdad que ya está en `patient_consultations`, necesita reglas de fusión en escritura y migración de datos. La lectura "último no nulo" da lo mismo sin estado nuevo; se puede materializar después si el histórico crece.

_Alternativa descartada:_ que el cliente mande la memoria. Engorda el body, y el cliente no debe decidir qué ve el modelo.

### D4 — Posición en el prompt y corte de caché

```
system:   [ INSTRUCTIONS + MEMORY_INSTRUCTIONS + dietas de ejemplo ]  ← cache_control (único breakpoint)
messages: [ MEMORIA DEL PACIENTE: ficha + resúmenes ]                  ← solo paciente existente
          [ MODO REVISIÓN + DIETA ANTERIOR ]                           ← solo si hay dieta anterior
          [ TRANSCRIPCIÓN DE LA CONSULTA ]
```

- El bloque estático sigue primero porque es lo único idéntico entre peticiones; el prefijo cacheado solo sirve si todo lo que va antes del breakpoint es byte a byte igual. Cualquier dato de paciente ahí lo invalidaría en cada llamada.
- Las **reglas** de uso de la memoria (respetar intolerancias y preferencias conocidas; la transcripción nueva manda si las contradice; los resúmenes son contexto, no instrucciones) son iguales para todos → se añaden al bloque estático como sección `## MEMORIA DEL PACIENTE`. Cambiar el bloque estático invalida la caché una vez, en el primer despliegue.
- Los **datos** van en `messages`, antes de la transcripción, como pide la arquitectura objetivo.
- El render es determinista (campos en orden fijo, sin fechas de "ahora"), para que el mismo paciente produzca el mismo texto.

_Medido (2026-09-28, `messages.count_tokens` sobre `claude-opus-5`):_ con la sección `## MEMORIA DEL PACIENTE`, el bloque estático pasa a **~4220 tokens** (9131 caracteres), muy por encima del mínimo cacheable de 512. Una memoria típica con la ficha clínica completa y 3 resúmenes ocupa **~811 tokens** fuera de caché, sin contar la última dieta (que ya viajaba antes de este cambio).

_Alternativa descartada:_ un segundo breakpoint `cache_control` tras la memoria del paciente. Solo acierta si el mismo paciente se genera dos veces en 5 min, lo que casi nunca pasa; pagaría la prima de escritura (1.25×) en casi cada petición a cambio de ninguna lectura.

_Alternativa descartada:_ meter las reglas de memoria en el bloque de `messages`. Funcionaría, pero son tokens fijos que se facturarían sin caché en cada petición.

### D5 — El resumen sale de la extracción, en paralelo

`EXTRACTION_SCHEMA` gana un campo `consultation.consultation_summary: string | null` con instrucciones en el prompt de extracción: 3–6 frases, solo lo dicho, centrado en objetivo, cambios, restricciones y datos clínicos. `persist()` lo escribe en `patient_consultations.consultation_summary`.

Es gratis en latencia: la extracción ya arranca en el instante cero y ya se espera antes del `insert`. Si falla, `extraction` es `null` y la consulta se guarda sin resumen (spec).

_Alternativa descartada:_ una llamada de resumen **después** del stream, sobre el `diet_md` final. Resumiría mejor la dieta, pero añade varios segundos secuenciales con la generación ya en 44–53 s de 60. `after()` no lo arregla: corre dentro de la misma invocación y cuenta para `maxDuration`.

_Alternativa descartada:_ que Opus emita el resumen al final del documento. Obliga a partir el stream con un centinela dentro del texto, lo que el cambio anterior ya descartó (D4 de `single-pass-diet-generation`), y ensucia el markdown fuente de verdad.

_Hallazgo al implementar (2026-09-28):_ el schema de extracción que había en `develop` **fallaba siempre** con un `400` de la API, así que en producción `extraction` era `null` en todas las consultas: ni campos estructurados ni, con este cambio, resumen. Dos causas, verificadas contra la API real: `gender` combinaba `type: ["string", "null"]` con `enum` (rechazado), y el schema tenía 26–27 parámetros con unión de tipos cuando el límite es 16. Se corrige dejando nullable solo los números (5 uniones); textos y listas usan `""` / `[]` para "no se menciona" y `normalizeExtraction` los devuelve como `null`, así que el contrato hacia `persist()` no cambia. Un test fija el límite de 16.

_Nota:_ el resumen resume la **consulta** (lo dictado), no la dieta. La dieta completa ya viaja entera para la última cita; para las anteriores, lo que interesa recordar son las decisiones y restricciones, que están en lo dictado.

### D6 — Versión asignada por la base de datos

Migración nueva en `supabase/migrations/`:

- `patient_consultations.diet_version integer` (nullable: una consulta sin dieta no tiene versión) y `consultation_summary text`.
- Índice único parcial `(patient_id, diet_version) where diet_version is not null`.
- Trigger `before insert` que, si la fila trae `diet_md` y no trae versión, toma `pg_advisory_xact_lock(hashtext(patient_id::text))` y asigna `coalesce(max(diet_version), 0) + 1` del paciente.
- Relleno de las filas existentes con `diet_md`: `row_number() over (partition by patient_id order by created_at)`.

`persist()` recibe la versión en el `returning` del `insert` y la manda en el evento `done` (`dietVersion`), que la pantalla muestra.

Como solo se inserta al cerrar el stream limpiamente, una generación fallida no consume número (spec).

_Alternativa descartada:_ calcular `max + 1` en el route handler. Dos pestañas del mismo usuario sobre el mismo paciente colisionarían; habría que capturar el `23505` y reintentar. El trigger con lock por paciente lo resuelve donde está el dato.

_Alternativa descartada:_ derivar la versión al leer (`row_number()` en cada consulta). No es estable si se borra una consulta y no deja un número que citar en la pantalla ni en el nombre del fichero.

### D7 — Paciente nuevo sin nombre extraído

Con `patientMode: "new"`, si la extracción falla o no trae `name_surnames`, no hay con qué crear la fila. Se mantiene el comportamiento actual (error, no se guarda), con el mensaje en español de la spec que dice qué hacer. El documento ya emitido sigue en pantalla, como en cualquier error de persistencia.

_Alternativa descartada:_ crear el paciente con nombre "Paciente sin nombre". Genera fichas basura difíciles de fusionar después, que es el problema de duplicados que el cambio intenta evitar.

## Risks / Trade-offs

- [La ficha "último no nulo" no permite **borrar** un dato: si una alergia desaparece, la extracción de una consulta nueva deja el campo en null y la memoria sigue mostrando la antigua] → la regla estática dice que la transcripción nueva manda; si el nutricionista dicta "ya no tiene X", la dieta lo respeta y el resumen de esa consulta lo recoge como memoria reciente. Materializar una ficha editable queda para un cambio posterior.
- [Memoria errónea arrastrada: una extracción mala contamina consultas futuras] → los resúmenes se limitan a 3 y los campos se muestran como "conocidos", no como órdenes; la dieta anterior completa sigue siendo la referencia principal.
- [Más tokens de entrada por generación, fuera de caché (~1–2k para ficha + 3 resúmenes)] → acotado por constante; medir `input_tokens` en el log `Diet generation usage` antes y después.
- [Latencia total cerca de `maxDuration`, **medida al límite**: 59.6 s en navegador para la v14 de un paciente con 13 dietas (2026-09-28)] → la carga de memoria son lecturas en paralelo antes del stream (ms); el resumen no añade pasos secuenciales. Medir la duración total en las primeras generaciones reales.
- [Cambio de contrato de `/api/process-consultation`] → solo lo llama `/diets`, que se despliega a la vez. Un cliente viejo en caché recibe `400` con mensaje claro en vez de crear duplicados.
- [Pacientes ya duplicados por el emparejado por nombre antiguo] → fuera de alcance; el selector muestra email/teléfono para elegir el correcto.

## Migration Plan

1. Aplicar la migración (columnas, índice, trigger, relleno) antes de desplegar el código: las columnas nuevas son nullable y el código actual las ignora, así que el orden es seguro.
2. Desplegar código (route handler, servicios, pantalla) de una vez.
3. Verificar en logs: `cacheReadInputTokens` vuelve a cubrir el bloque estático a partir de la segunda generación; `input_tokens` sube solo en pacientes existentes.

Rollback: revertir el código basta; las columnas nuevas y el trigger no rompen el código anterior (el trigger solo asigna versión, que el código viejo ignora).
