# Design

## Context

- `patient_consultations` guarda por fila `diet_md` (el documento, fuente de verdad), `diet_version` (asignada por trigger, única por paciente), `objetivo_calorias`, `audio_transcription`, `consultation_summary` y, tras `add-weight-history`, `weight`.
- El documento pauta **raciones de alimento**, no macronutrientes. En la dieta de ejemplo (`src/constants/diet-examples.ts`, sección `## Cantidades`), por ejemplo: "Hidrato en comida: 60 gr, o 200 gr de patata o batata", "Proteína: 140 gr de carne roja y 160 gr de pescado…", "Gazpacho y cremas: 150-200 ml". Hay cantidades base, equivalencias y rangos.
- `diet_md` no se edita después de guardarse. `POST /api/upload-diet` lo reescribe, pero con el mismo texto generado en streaming: hoy no hay editor. Si se añade uno, habrá que invalidar `diet_portions` y `diet_changes` al cambiar el documento.
- La extracción existente usa `output_config.format` con `json_schema` y el límite de 16 parámetros con unión de tipos por schema (ver el comentario de `consultation-extraction-service.ts`).
- `process-consultation` ya ronda los 60 s de `maxDuration`: no admite más trabajo.

## Goals / Non-Goals

**Goals:**

- Diferencias deterministas en lo numérico (kcal, peso y raciones) y el modelo solo donde hace falta juicio (emparejar alimentos y explicar el porqué).
- Cada proyección se paga una sola vez y se guarda en la fila.
- Nada de esto en el camino de generación de la dieta.

**Non-Goals:**

- Macronutrientes en gramos. No se pautan, y estimarlos iría contra la regla de no inventar datos.
- Comparar dos versiones cualesquiera. Solo pares consecutivos.
- Editar o regenerar dietas desde el comparador.

## Decisions

### D1. Dos proyecciones: raciones por dieta y cambios por par

```
fila N ── diet_portions  (de diet_md N, sola)       → gráfica + Δ en código
       └─ diet_changes   (de diet_md N-1 + diet_md N + transcripción N)
                          → entran / salen / resumen
```

- Las **raciones son por dieta**. La gráfica necesita un valor por versión, y con grupos fijos la diferencia numérica se calcula en código, sin que la decida el modelo.
- Los **alimentos que entran y salen y el resumen son por par**. Comparar listas libres en código falla con los sinónimos ("pan blanco" frente a "pan de molde"), y el modelo, viendo los dos documentos juntos, los empareja.
- **Descartado: una sola llamada por par que devuelva también las raciones de los dos lados.** No da raciones para v1 ni una serie coherente para la gráfica, y cada dieta se proyectaría dos veces (como N y como N-1), con riesgo de dar dos valores distintos a la misma dieta.
- **Descartado: calcular los alimentos que entran y salen en código a partir de listas por dieta.** Exige normalizar nombres (plurales, marcas, "sin azúcar") con reglas propias. El modelo hace ese trabajo mejor y lo necesitamos igualmente para el resumen.

### D2. Grupos fijos y una cantidad base por grupo

`diet_portions` = `{ version: 1, groups: PortionEntry[] }` con

```ts
type PortionGroup =
  | "hidrato_comida"
  | "hidrato_cena"
  | "proteina"
  | "lacteos"
  | "pan"
  | "grasas"
  | "fruta"
  | "verdura"
  | "otros";
type PortionEntry = {
  group: PortionGroup;
  label: string; // "Proteína", "Frutos secos"…
  min: number;
  max: number; // igual si no es rango
  unit: "g" | "ml" | "ud";
  alternatives: string; // equivalencias y variantes, texto: "o 200 g de patata"
};
```

Hay **una entrada por grupo**. La cantidad base es la primera que pauta el documento; las equivalencias ("o 200 gr de patata") y las variantes ("160 gr de pescado") van como texto en `alternatives`. Así hay un único número por grupo y dieta, que es lo que necesitan la gráfica y la diferencia. Lo que no encaja en un grupo va a `otros`, con su etiqueta.

- **Descartado: grupos libres, los que diga el documento.** Entre versiones, el modelo puede nombrar "Hidrato comida" y "Carbohidratos almuerzo", y la diferencia dejaría de alinearse.
- **Descartado: varias entradas por grupo.** Sumar 140 g de carne roja y 160 g de pescado no tiene sentido, porque son alternativas, y elegir una sería arbitrario sin una regla. "La primera que se pauta" es la regla.
- El schema tiene 6 campos por entrada y ninguna unión de tipos, así que queda muy lejos del límite de 16.
- La lista de grupos es una constante en `src/constants/`. Ampliarla es un cambio de datos, aunque las filas ya proyectadas no se vuelven a proyectar solas (ver Riesgos).

### D3. Modelo: el de extracción, no el de generación

Las dos proyecciones usan el modelo de extracción (Haiku) con salida estructurada `json_schema`, como `consultation-extraction-service.ts`.

- **Descartado: Opus.** Es el modelo de generación, y la propuesta excluye llamarlo. Además, sus 40-60 s de latencia no caben en una sección que se abre con la ficha. Leer dos documentos y describir diferencias es trabajo de extracción.

### D4. Cálculo perezoso en route handlers, guardado en la fila

- `POST /api/diet-portions { patientId }`: carga las consultas del usuario para ese paciente con `diet_md` y `diet_portions is null`, las proyecta en paralelo (concurrencia máxima de 4), guarda cada una en cuanto termina y devuelve todas las raciones del paciente. Si fallan algunas, devuelve las que sí tiene y `failed: [consultationId]`. Errores: `400` sin `patientId`, `404` si el paciente no es del usuario.
- `POST /api/compare-diets { consultationId }`: resuelve la versión anterior (`max(diet_version) < N` del mismo paciente). Si `diet_changes` ya existe y su `previousConsultationId` coincide con la anterior actual, lo devuelve tal cual. Si no, asegura `diet_portions` de las dos dietas y calcula `diet_changes` en paralelo, y guarda. Devuelve `{ previous, current, portionsDelta, added, removed, summary }`. Errores: `400` sin id; `404` si la consulta no es del usuario o no existe; `409` si es la primera versión (con el mensaje de la spec); `500` con `{ error }` si falla el modelo. Todos los cuerpos de error llevan `error`, como en las demás rutas.
- La diferencia de raciones se calcula en el servidor, en una función pura (`diffPortions`), y solo cuando las dos entradas del grupo comparten unidad.
- `diet_changes` = `{ version: 1, previousConsultationId, added: string[], removed: string[], summary: string, createdAt }`. El `previousConsultationId` es la invalidación de la spec: si cambia la versión anterior, la comparación deja de coincidir y se recalcula.
- **Descartado: calcular al guardar la consulta**, dentro de `process-consultation`. Ya está a 59,6 s de 60, y una llamada más la empuja fuera de `maxDuration`. Tampoco sirve `after()`: cuenta contra la misma duración de la función.
- **Descartado: un script de backfill como en `add-weight-history`.** El cálculo perezoso ya cubre las dietas antiguas la primera vez que se abre cada paciente, sin un paso operativo más.
- **Descartado: no guardar, calcular en cada apertura.** Da un coste y una espera en cada visita, y además el resumen cambiaría de redacción entre visitas.
- **Descartado: tabla `diet_comparisons(from_id, to_id)`.** Solo haría falta con pares arbitrarios, y con pares consecutivos la fila N basta.

### D5. Qué ve el modelo en cada llamada (prompts y caché)

- **Raciones**: system estático (instrucciones, grupos, regla de "primera cantidad base" y "no inventes: si no se pauta, no hay entrada") + `diet_md`.
- **Cambios**: system estático (instrucciones y reglas de "qué solo de los documentos, por qué solo de la consulta, di explícitamente si no consta el motivo") + `diet_md` N-1 + `diet_md` N + la transcripción de N. Si no hay transcripción, se usa `consultation_summary` de N, y si tampoco hay, se indica explícitamente al modelo que no hay registro de la consulta.
- **Caché**: el orden es [system estático] → [documentos y consulta], de modo que el único prefijo que podría cachearse va primero, como en generación. Aun así, **no se marca `cache_control`**. El system no llega al prefijo mínimo cacheable de Haiku (4096 tokens), y los documentos de cada llamada son de un solo uso (cada par se calcula una vez). Marcarlo solo pagaría la prima de escritura. Mismo criterio que la extracción.

### D6. UI: componente propio, tabla simple

- `src/components/patients/diet-comparison.tsx`: el `Select` de versión (v2..vmax, por defecto la última), una tabla HTML simple (valor anterior / actual / Δ), chips de entran/salen y el resumen. Las diferencias de kcal y peso se pintan con los datos que la página ya ha cargado, sin esperar a la ruta.
- **Descartado: TanStack Table.** Son unas 10 filas fijas, sin orden ni paginación. Si en el futuro se usara, aplica la regla 3: `data` y `columns` con `useMemo`.
- La gráfica de raciones es un `LineChart` aparte, debajo de la de evolución, con una línea por **grupo y unidad** y una leyenda que las muestra y oculta. En la verificación con datos reales, el pan aparecía en piezas en unas dietas y en gramos en otras. Una línea por grupo unía puntos de unidades distintas, así que cada unidad tiene su propia línea. La gráfica solo llama a `diet-portions` si falta alguna ración; en otro caso pinta lo que la ficha ya trae. **Descartado: añadirla como tercera serie a la gráfica de kcal y peso.** Tres escalas (kcal, kg, g) en una gráfica no se leen.

### Vercel serverless

- **Tiempo**: `compare-diets` en frío son como mucho 3 llamadas a Haiku en paralelo (raciones N-1, raciones N y cambios). Cambios lee unos 3 documentos de unos pocos miles de tokens cada uno. Se fija `maxDuration = 60`. `diet-portions` para un paciente con muchas dietas antiguas se limita a 4 en paralelo y cada una se guarda en cuanto termina: si la función se corta, lo ya hecho queda y la siguiente carga continúa.
- **Body**: las peticiones llevan solo ids. Los documentos se leen de la BD en el servidor.
- **Filesystem**: los prompts y la lista de grupos son constantes TS (regla 2).

## Risks / Trade-offs

- [El modelo pone la misma ración en grupos distintos entre dos versiones (p. ej. "pan" frente a "hidrato_comida")] → Grupos con descripción explícita en el prompt y un test con la dieta de ejemplo que fija su proyección esperada. Si ocurre, la diferencia muestra el grupo vacío en un lado, que es un fallo visible y no silencioso.
- [Paciente con muchas dietas antiguas: la primera apertura tarda] → La sección muestra lo ya disponible y un indicador. Las raciones se guardan de una en una.
- [Se amplía la lista de grupos y las filas ya proyectadas no lo reflejan] → `diet_portions.version`: si se sube la versión del schema, las filas con una versión menor se tratan como no proyectadas y se recalculan en la siguiente apertura.
- [El resumen atribuye un motivo que no se dijo] → Instrucción explícita, más un test de prompt con una transcripción sin motivos que exige la frase de "no consta". Como la entrada del porqué es la transcripción literal, no un resumen de un resumen, hay menos riesgo de desviarse.
- [Los datos de salud van al proveedor] → Son los mismos documentos y la misma transcripción que ya recibe el proveedor al generar. No hay destino nuevo.

## Migration Plan

1. Archivar antes `add-weight-history` (este cambio añade requisitos a `patient-evolution`, que crea aquel).
2. Aplicar la migración (`diet_portions jsonb`, `diet_changes jsonb`, ambas nullable) antes de desplegar.
3. Desplegar. Las dietas existentes se proyectan solas la primera vez que se abre cada paciente.
4. Rollback: revertir el código. Las columnas pueden quedarse, porque nada más las lee.
