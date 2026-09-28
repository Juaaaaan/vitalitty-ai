# Design

## Context

- La extracción (`src/services/consultation-extraction-service.ts`) ya devuelve `patient.weight` en kg y normalizado. `persist()` en `app/api/process-consultation/route.ts` lo usa solo para actualizar `patients.weight`, filtrando los `null`, y no lo escribe en la fila de `patient_consultations`.
- `patients.weight` lo leen la memoria del paciente (`patient-context-service.ts:78`) y la ficha del paciente ("Datos del paciente").
- Las consultas guardan `audio_transcription`, así que el peso dictado se puede recuperar. El audio no se guarda.
- La ficha (`app/dashboard/patient/[id]/page.tsx`) pinta hoy un `BarChart` de `objetivo_calorias` con `ChartContainer` de shadcn.
- No hay cliente de Supabase con service role en el repo. El único acceso de servidor es `lib/supabase/server.ts`, que lleva la sesión del usuario.

## Goals / Non-Goals

**Goals:**

- Guardar un peso por consulta a partir de ahora, sin llamadas nuevas al modelo en runtime.
- Recuperar una sola vez el peso de las consultas existentes.
- Gráfica compuesta de calorías y peso, preparada para que `add-diet-comparison` le añada la serie de raciones.

**Non-Goals:**

- Editar el peso a mano. Si la extracción se equivoca, se corrige en otro cambio (la ficha editable del paciente sigue pendiente).
- Otras medidas corporales (grasa, perímetros). No se dictan de forma sistemática.
- Cambiar `patients.weight` o la memoria del paciente.

## Decisions

### D1. Columna `weight` en `patient_consultations`

Se añade una columna `weight numeric` nullable. Un peso por consulta es exactamente la granularidad que se dicta.

- **Descartado: tabla `weight_measurements(patient_id, measured_at, kg)`.** Solo sería necesaria si hubiera pesos fuera de consulta, y hoy no los hay. Añadiría un join y una segunda escritura en `persist()` a cambio de nada. Si algún día llegan pesos desde otra fuente, se migra entonces.

### D2. `patients.weight` se mantiene como "último peso conocido"

`persist()` sigue actualizándolo igual que ahora y, además, escribe `extraction.patient.weight` en la fila de la consulta.

- **Descartado: calcularlo como el peso de la última consulta.** Obliga a cambiar la memoria del paciente, la ficha y el listado, y se pierde un peso dado de alta sin consulta. Sería un cambio de comportamiento que este cambio no necesita.

### D3. Backfill con un script local y un schema de un solo campo

`scripts/backfill-consultation-weight.ts` se ejecuta con Node, que en la versión actual (26) ejecuta TypeScript sin paso de compilación. Selecciona las consultas con `weight is null` y `audio_transcription is not null`, pide a Haiku un JSON `{ weight: number | null }` con la misma regla de normalización a kg que la extracción, y actualiza **solo** `weight` y solo si el valor devuelto no es `null`.

- Usa la service role key, tomada del entorno local y nunca del repo, porque tiene que leer las consultas de todos los usuarios sin sesión. No se añade al código de la app.
- Es idempotente por construcción: las filas que ya tienen peso no se seleccionan. Las que no tienen peso dictado se vuelven a procesar si se repite la ejecución, y siguen sin peso. Se acepta ese coste porque son pocas llamadas a Haiku.
- Tiene su propio cliente de Anthropic y su propio prompt mínimo. Importar el servicio desde un script de Node obligaría a resolver el alias `@/`, que Node no entiende.
- **Descartado: reutilizar la extracción completa.** Devolvería 30 campos y tentaría a reescribir los de las consultas antiguas, lo que va contra la spec ("solo el peso").
- **Descartado: una ruta `/api/admin/backfill`.** Sería una operación por lotes y entre usuarios expuesta en producción, limitada por `maxDuration`, y habría que protegerla para usarla una sola vez.
- **Descartado: SQL.** Postgres no llama al modelo, y un regex sobre el texto dictado ("ochenta y dos con cinco") no es fiable.

**Prompt y caché:** el prompt del backfill es un system corto seguido de la transcripción. No lleva `cache_control`, por el mismo motivo que la extracción: está muy por debajo del prefijo mínimo cacheable de Haiku (4096 tokens), y marcarlo solo pagaría la prima de escritura. Si lo llevara, el system estático iría primero y la transcripción detrás, que es el único orden en el que el corte podría servir.

### D4. `ComposedChart` con dos ejes Y

Se usa Recharts `ComposedChart` dentro del `ChartContainer` existente: `Bar` para `objetivo_calorias` en `yAxisId="kcal"` (izquierda) y `Line` para `weight` en `yAxisId="kg"` (derecha, dominio ajustado a los datos, no desde 0), con `connectNulls` para que una consulta sin peso no corte la línea. Los datos los construye una función pura, `buildEvolutionData(consultations)`, que se puede testear sin montar la página. El eje X incluye todas las consultas con kcal o peso.

- **Descartado: dos gráficas separadas.** Ocupan el doble de altura y se pierde la lectura de "bajé kcal y bajó el peso" en el mismo eje de tiempo.
- **Descartado: un solo eje Y.** Con 2000 kcal y 80 kg, el peso sería una línea plana pegada al suelo.
- No toca `src/components/ui/` (regla 4): se usan `ChartContainer` y `ChartTooltipContent` tal cual.

### Vercel serverless

- Runtime: `persist()` solo añade un campo al insert que ya existe. No hay llamadas nuevas ni se acerca a `maxDuration`.
- El backfill no corre en Vercel, así que no le aplican ni la regla 2 ni el límite de tiempo. Sí le aplica una regla de disciplina: no se importa desde `app/` ni `src/`.

## Risks / Trade-offs

- [La extracción confunde el peso objetivo con el peso actual ("quiere llegar a 75")] → El prompt del backfill pide explícitamente el peso **actual** medido en la consulta. Además, se revisa una muestra a mano tras el backfill (tarea 2.3).
- [Se envían transcripciones antiguas al proveedor] → Es el mismo proveedor y el mismo tipo de dato que ya recibe la extracción en cada consulta. No hay un flujo de datos nuevo.
- [Service role key en una máquina local] → Solo en el entorno del que ejecuta el script, fuera del repo y fuera de Vercel. El script no la imprime.
- [Consultas con `weight` pero sin `objetivo_calorias`, y al revés] → Cubierto por la spec. La serie ausente no pinta nada para esa consulta.

## Migration Plan

1. Aplicar la migración (`patient_consultations.weight`) **antes** de desplegar: el código nuevo inserta la columna, y sin ella el insert de `persist()` fallaría.
2. Desplegar el código.
3. Ejecutar el backfill en local contra producción y revisar el recuento que imprime (procesadas, con peso, sin peso).
4. Rollback: revertir el código. La columna puede quedarse, porque ignorarla no afecta a nada, o eliminarse con `alter table ... drop column weight`.
