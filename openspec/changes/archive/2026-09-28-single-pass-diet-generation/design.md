# Design

## Context

Ver `proposal.md` — Why para la motivación.

Estado actual:

```
app/diets/page.tsx
  handleRecordingComplete  → POST /api/transcribe          (ya migrado a gpt-4o-transcribe)
  handleConfirmAndProcess  → POST /api/process-consultation { transcription, existingPatientId }
                                   │
                                   ├─ extractPatientData(transcription)    gpt-4o, JSON schema
                                   └─ generateDietMarkdown(transcription)  gpt-4o + DIET_TEMPLATE
                                        (Promise.all, respuesta JSON única al final)
                                   │
                                   └─ insert patient_consultations { audio_transcription, diet_md, ... }
  handleSaveDiet           → fetch("/api/upload-diet")  → ruta INEXISTENTE; solo existía la Server Action uploadDiet()  [paso manual]
```

Datos que condicionan el diseño y que se verificaron, no se supusieron:

- El paciente **ya está resuelto antes de generar**. `handleConfirmAndProcess` envía `existingPatientId`. No hay que reordenar el flujo para meter la dieta anterior en contexto.
- `patient_consultations.diet_md` y `documento_url` ya existen. Sin cambios de esquema.
- La dieta de ejemplo existe como el PDF de una paciente real en `public/diets_example/` (no versionado: datos de salud): 5 páginas, ~750 palabras, ~2.5k tokens en español.
- `@anthropic-ai/sdk` no es dependencia. Solo está instalado `openai`.

Restricciones de Vercel serverless que atraviesan todo el diseño:

- Sin filesystem en runtime. Descarta leer el PDF o cualquier `.md` de `public/` con `readFileSync`.
- Límite de duración de función. Una generación de 5 páginas puede tardar más que el tope por defecto; ver D9 y Risks.
- El cliente llama a route handlers, nunca a Server Actions.

## Goals / Non-Goals

**Goals:**

- Un único punto donde se define el prompt de generación, su orden y su corte de caché.
- Primer texto en pantalla en pocos segundos, medible.
- Añadir una segunda dieta de ejemplo sin tocar la lógica de generación.

**Non-Goals:**

- Cambiar el paso de subida a Storage: sigue siendo manual y hace lo mismo. Solo cambia el transporte (D12).
- Editar la dieta en pantalla después de generarla.
- Regenerar dietas históricas con el modelo nuevo.
- Comparación de dietas entre citas y gráficas: son el siguiente cambio, no este.

## Decisions

### D1 — La generación sale a su propio servicio

`extraction-service.ts` se parte en dos: `diet-generation-service.ts` (Opus, streaming, prompt) y una extracción reescrita contra Haiku. `DIET_TEMPLATE` se elimina con él.

_Alternativa descartada:_ mantener un solo servicio con ambas llamadas. Son dos modelos, dos formas de respuesta (stream vs objeto) y dos ciclos de vida distintos; el fichero de 552 líneas ya demostró que mezclarlos hace que nadie sepa cuál es el camino principal.

### D2 — Corte de caché: bloque estático en `system`, lo variable en `messages`

El orden de render de la API es `tools` → `system` → `messages`. El bloque estático va en `system` con un breakpoint `cache_control` explícito al final; el contexto del paciente y la transcripción van en `messages`, fuera del prefijo cacheado.

```
system:  [ instrucciones + reglas nutricionales + dieta(s) de ejemplo ]  ← cache_control aquí
messages: [ contexto del paciente + dieta anterior ]
          [ transcripción de la consulta ]
```

**Breakpoint explícito, no caché automática.** La caché automática coloca el corte en el último bloque cacheable y lo mueve hacia adelante. Este prompt termina en contenido único por petición (la transcripción), así que el corte automático caería _después_ de la cola única: se pagaría la prima de escritura en bytes que nunca se releen, un recargo puro. La firma de ese fallo es `cache_creation_input_tokens` en cada petición mientras `cache_read_input_tokens` nunca cubre el prefijo compartido.

**El bloque estático tiene que ser idéntico byte a byte.** Nada de fechas, ids de petición ni serialización con orden de claves no determinista. Un solo byte distinto invalida todo lo que va detrás.

_Alternativa descartada:_ meter el contexto del paciente dentro del bloque cacheado para "cachear más". Cambia en cada consulta, así que invalidaría la caché en cada llamada y además arrastraría el prefijo entero.

### D3 — TTL de caché: empezar en 5 minutos, medir antes de subir a 1 hora

Escritura de caché: 1.25× con TTL de 5 minutos, 2× con TTL de 1 hora. Lectura: ~0.1×. El punto de equilibrio es **2 peticiones con TTL de 5 min** y **3 con TTL de 1 h**.

El patrón de uso decide cuál gana, y no lo sabemos todavía. Si la nutricionista encadena consultas seguidas, 5 minutos basta y es más barato de escribir. Si hay huecos de media hora entre pacientes, con 5 minutos casi siempre se falla y se paga la escritura una y otra vez sin leerla nunca.

Se arranca con el TTL por defecto de 5 minutos y se instrumenta `usage.cache_read_input_tokens`. Si las lecturas salen persistentemente a cero, se sube a `ttl: "1h"`. Es cambiar un campo.

_Alternativa descartada:_ arrancar directamente en 1 hora. Duplica el coste de escritura desde el primer día a cambio de una ventaja que solo existe si el patrón de uso es disperso, cosa que no está medida.

_Nota:_ el prefijo mínimo cacheable de `claude-opus-5` es de 512 tokens. El bloque estático (~2.5k del ejemplo más las instrucciones) lo supera con holgura, así que la caché sí se activa. Con un modelo de mínimo 4096 no se habría activado; no es un detalle transferible.

_Medido (2026-09-28, `messages.count_tokens` sobre `claude-opus-5`):_ el bloque estático completo (`STATIC_PROMPT_BLOCK`, 7279 caracteres, un ejemplo) ocupa **3462 tokens**. Supera el mínimo de 512 casi 7 veces. Tras endurecer las instrucciones de estructura (8.3) y quitar el `@vitalittynutri` del ejemplo, **3857 tokens** (8243 caracteres); caché verificada de nuevo: escritura 3859, lectura 3859 en la siguiente llamada. Ojo: seguiría por debajo de 4096 — si algún día la generación se moviese a un modelo con ese mínimo, la caché dejaría de activarse en silencio hasta añadir un segundo ejemplo.

### D4 — Transporte del stream: eventos tipados, no texto crudo

El route handler responde con un stream de eventos, no con el markdown pelado. Hacen falta al menos tres tipos: fragmento de texto, error, y cierre con el identificador de la consulta creada.

Razón: el cliente necesita el `consultationId` al final para que el botón de subida a Storage siga funcionando. Con markdown crudo no hay canal para ese dato sin inventar un centinela dentro del propio texto, que es frágil — un centinela puede aparecer literalmente dentro de una dieta.

_Alternativa descartada:_ devolver markdown crudo y hacer una segunda petición al terminar para averiguar el `consultationId`. Un viaje de red extra y una ventana en la que el botón de guardar no sabe a qué consulta apunta.

### D5 — Persistencia: acumular en servidor, escribir al cerrar

El servidor acumula el markdown mientras lo emite y hace el `insert` cuando el stream se cierra limpiamente. Si la generación falla a mitad, no se escribe nada.

Esto mantiene una sola escritura en base de datos y evita que el cliente tenga que devolver el documento. También evita guardar dietas parciales, que serían ruido en el histórico del paciente.

_Alternativa descartada:_ que el cliente reenvíe el markdown completo al terminar. Duplica el documento por la red y abre la puerta a que se guarde algo distinto de lo que se generó.

**Desconexión del cliente:** si el usuario cierra la pestaña a mitad, el stream se cancela. El comportamiento por defecto — no guardar — es el correcto y no requiere código extra, pero conviene verificarlo explícitamente en vez de asumirlo.

### D6 — Extracción en paralelo, esperada solo al final

Ambas llamadas se lanzan a la vez. La generación manda: sus fragmentos salen en cuanto llegan. La extracción con Haiku corre de fondo y solo se espera al cerrar el stream, justo antes del `insert`, para que patient y consultation entren en la misma escritura.

Como arrancó en el instante cero y Haiku es rápido frente a una generación de 5 páginas, lo normal es que ya esté lista y la espera sea de cero. Si falla o tarda de más, se guarda la consulta con el documento y sin los campos extraídos: el documento es la fuente de verdad, los campos son su proyección.

_Alternativa descartada:_ esperar la extracción antes de empezar a emitir. Es exactamente el bloqueo que este cambio elimina.

_Alternativa descartada:_ dos escrituras separadas, una al cerrar el stream y otra cuando llegue la extracción. Deja una ventana con la consulta a medio poblar y complica el histórico.

### D7 — La extracción con Haiku no se marca para caché

El prefijo mínimo cacheable de `claude-haiku-4-5` es de **4096 tokens**. El prompt de extracción es bastante más corto. Marcarlo no daría error: simplemente no cachearía nada, en silencio, y se pagaría la prima de escritura a cambio de cero lecturas.

Se deja sin marcar a propósito. Si algún día el prompt de extracción crece por encima de ese umbral, se revisa.

### D8 — La dieta de ejemplo se convierte una vez y se congela como módulo TS

El PDF se convierte a markdown en tiempo de autoría — no en runtime — y el resultado se revisa a mano y se guarda como constante TypeScript. El PDF puede quedarse en `public/` como referencia documental, pero deja de ser lo que lee el código.

Tres razones, en orden de peso: no hay filesystem en runtime; la conversión automática de un PDF maquetado produce artefactos que hay que limpiar a ojo una vez, no en cada petición; y el bloque estático debe ser byte a byte idéntico entre peticiones (D2), cosa que una conversión en vivo no garantiza.

La constante se expone como una **lista** de ejemplos desde el primer día, aunque hoy tenga un elemento. Añadir el segundo es entonces añadir un elemento, no cambiar la forma del prompt.

_Alternativa descartada:_ que el servidor haga `fetch` del PDF o de un `.md` desde `public/` en cada generación. Un viaje de red por petición, un punto de fallo nuevo, y ninguna garantía de estabilidad byte a byte.

_Alternativa descartada:_ mandar el PDF como bloque `document` en el prompt. Es posible y se puede cachear, pero la salida que queremos es markdown; darle markdown de ejemplo enseña el formato de salida directamente, mientras que un PDF le enseña un documento maquetado que tendría que traducir mentalmente.

### D9 — Modelos, esfuerzo y el pensamiento que retrasa el primer token

Generación: `claude-opus-5`. Extracción: `claude-haiku-4-5`.

En `claude-opus-5` el pensamiento está **activado por defecto** y su visualización viene **omitida** por defecto. Traducido a esta pantalla: el modelo piensa antes de emitir texto y, con la configuración por defecto, el usuario ve un stream abierto que no escribe nada durante ese rato. Eso choca de frente con el criterio de aceptación de "texto apareciendo en pocos segundos".

Hay tres palancas y se combinan dos:

1. **Bajar `effort`** a `medium`. Acorta el pensamiento y adelanta el primer token. Redactar una dieta siguiendo un ejemplo no es el tipo de problema que rentabiliza `high`.
2. **`thinking.display: "summarized"`**, para que durante ese rato haya algo que enseñar en pantalla en vez de un hueco.
3. Desactivar el pensamiento. **Descartada**: en `claude-opus-5` desactivarlo tiene modos de fallo conocidos — texto que debería ser una llamada a herramienta, etiquetas internas filtradas — y la vía recomendada para abaratar es bajar el esfuerzo, no apagarlo.

Se implementan 1 y 2, y se mide el tiempo hasta el primer token visible. Si sigue siendo alto, la siguiente palanca es `effort: "low"`, no apagar el pensamiento.

`max_tokens` se fija con holgura para el streaming: una dieta de 5 páginas no cabe en un tope pequeño y quedarse corto trunca el documento a media frase.

### D10 — Salida estructurada para la extracción

La extracción con Haiku usa salida estructurada (`output_config.format`) en lugar del esquema JSON por herramienta que usa hoy el código con `gpt-4o`. Es el mecanismo vigente para obtener un objeto validado contra un esquema.

_Alternativa descartada:_ pedir JSON en el prompt y parsearlo a mano. Es lo que obliga a escribir código defensivo de parseo que la salida estructurada ya garantiza.

### D11 — Se retira `save-consultation.action.ts`

Duplica la orquestación del route handler, es una Server Action llamada desde cliente — contra la regla de transporte del proyecto — y con el flujo de streaming queda huérfana: la lógica de persistencia se mueve al cierre del stream.

`upload-diet.action.ts` corre la misma suerte, pero después de portarse: ver D12.

### D12 — La subida a Storage pasa a route handler dentro de este cambio

La página ya llamaba a `fetch("/api/upload-diet")`, pero esa ruta no existía: solo estaba la Server Action `uploadDiet`. El botón "Guardar dieta" que sigue a la generación apuntaba a una ruta inexistente. Es una dependencia real de este flujo, así que se resuelve aquí siguiendo migrar-y-borrar: se crea `app/api/upload-diet/route.ts` con la lógica de la Server Action portada tal cual, y se borra el `.action` una vez que ya no tiene consumidores.

El contrato es el que la página ya espera, para no tocarla: cuerpo `{ consultationId, patientId, dietMd }`, respuesta `{ success, url?, error? }`. Los errores llevan además status HTTP (`400` sin campos, `401` sin usuario, `500` si falla Storage o la actualización), pero el cuerpo siempre trae `success` y `error`, porque el cliente lee el cuerpo antes que el status.

_Alternativa descartada:_ llamar a `uploadDiet` directamente desde la página. Incumple la regla 1.

_Alternativa descartada:_ sacar la migración a otro cambio. Obligaría a archivar este con la subida rota.

**El bucket no existía.** Al probar la subida, Storage respondió `Bucket not found`: el proyecto de Supabase no tenía ningún bucket (tampoco `audios`), así que la Server Action tampoco habría funcionado nunca. Se crea con la migración `create_private_diets_bucket` (versionada en `supabase/migrations/20260928193500_create_private_diets_bucket.sql`), y el usuario decide que sea **privado** y no público, que era lo que asumía `getPublicUrl()`: son datos de salud, y con un bucket público cualquiera que tenga la URL lee la dieta.

- Ruta: `{user_id}/{patient_id}/{consultation_id}.md`. Cuatro políticas sobre `storage.objects` (select, insert, update, delete) exigen que la primera carpeta sea `auth.uid()`, el mismo modelo `created_by = auth.uid()` del RLS de `patients` y `patient_consultations`. El bucket solo admite `text/markdown`, con un tope de 1 MB.
- `documento_url` guarda la **ruta**, no una URL (el nombre de la columna ya no describe bien lo que guarda; ver TODO en Open Questions). El route handler devuelve una URL firmada válida 1 h para el enlace inmediato; la ficha del paciente firma una de 60 s al pulsar "Ver dieta".
- Antes de subir, el route handler comprueba que la consulta existe y pertenece al paciente (`404` si no), para no dejar ficheros huérfanos.
- Ninguna consulta tenía `documento_url` (0 de 19), así que cambiar el formato no requiere migrar datos.

## Risks / Trade-offs

- **El límite de duración de la función corta el stream** → una generación de 5 páginas puede superar el tope por defecto de una función serverless en Vercel. Es el riesgo con más probabilidad de morder. Mitigación: declarar `maxDuration` explícito en el route handler y medir cuánto tarda de verdad una generación completa antes de dar el cambio por bueno. Si el tope del plan no da, la conversación pasa a ser de plan de hosting, no de código.
- **El pensamiento de Opus 5 retrasa el primer token visible** → ver D9. Mitigación implementada (esfuerzo `medium` + pensamiento resumido) y medición explícita como criterio de aceptación.
- **Un solo ejemplo** → con una única dieta de ejemplo el modelo copia la estructura con fiabilidad, pero tiene poca evidencia de qué varía legítimamente entre pacientes; puede arrastrar detalles específicos de esa paciente a otras dietas. Mitigación: el conjunto es una lista desde el principio (D8) y revisar las primeras generaciones buscando contaminación del ejemplo. Añadir la segunda dieta real es el arreglo, no un rediseño.
- **La caché no se activa o no se lee** → mitigación: instrumentar `cache_read_input_tokens` desde el primer día. Si sale cero de forma persistente, o hay un invalidador silencioso en el bloque estático (D2) o el patrón de uso pide TTL de 1 hora (D3).
- **La dieta anterior hace crecer el prompt sin techo** → un paciente con años de histórico no puede meter todas sus dietas en contexto. Este diseño mete **solo la última**. Si en el futuro se quisieran varias, hay que decidir un techo; hoy no aplica.
- **Coste por generación sube** → Opus es más caro por token que `gpt-4o`, y además se manda un ejemplo completo en cada llamada. La caché absorbe buena parte del ejemplo a partir de la segunda llamada dentro de la ventana, pero la primera de cada ventana paga 1.25×. Se asume de forma consciente: la calidad del documento es el producto.
- **Retirar las Server Actions** → verificable por búsqueda de importadores antes de borrar, como en el cambio de transcripción. `upload-diet` se borra solo después de que el route handler cubra su función (D12).

## Migration Plan

1. Cambio de código y de dependencias. Sin migración de datos ni de esquema.
2. Las dietas ya generadas siguen siendo markdown válido en `diet_md`; ninguna se regenera.
3. Rollback: revertir el commit. El único estado nuevo son consultas generadas con el flujo nuevo, que siguen siendo markdown en el mismo campo y no dependen del modelo que las produjo.

## Open Questions

- **Techo real de duración de función en el plan de despliegue actual.** Determina si el streaming completo cabe. No cambia las specs ni el reparto de tareas — cambia si hace falta hablar de plan de hosting. Se resuelve midiendo (tarea del grupo de verificación).
  - _Medido (2026-09-28, llamadas reales a `claude-opus-5`, `effort: "medium"`):_ generación completa de paciente nuevo en **50,2 s y 51,5 s** (~3,6-3,9k tokens de salida, ~7k caracteres — casi el doble que el ejemplo); revisión en 34,6 s. Con las instrucciones de estructura endurecidas (8.3), **43,9 s y 52,6 s** (~4k tokens de salida, 7-8k caracteres: escribir los 7 días uno a uno no acorta la dieta). Cabe en `maxDuration = 60`, pero deja ~8 s para leer BD, esperar la extracción y persistir. Una consulta más larga o un pico de latencia lo corta. Antes de desplegar: confirmar el tope del plan y subir `maxDuration` si lo permite, o bajar la longitud de salida.
- **Patrón de uso real** (consultas seguidas o espaciadas), que decide el TTL de caché. No bloquea: se arranca con el valor por defecto y se ajusta con la medición (D3).
- **TODO futuro — `patient_consultations.documento_url` guarda una ruta de Storage, no una URL.** Desde D12 contiene `{user_id}/{patient_id}/{consultation_id}.md` y el enlace se firma al abrirlo. El nombre engaña a quien lea la tabla. Decisión del usuario: no cambiar el esquema en este cambio. Si se renombra (p. ej. a `documento_path`), hay que tocar el route handler de subida y la ficha del paciente.
