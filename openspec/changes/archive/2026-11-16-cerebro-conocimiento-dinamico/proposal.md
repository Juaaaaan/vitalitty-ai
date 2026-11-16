# Proposal

## Why

Hoy el comportamiento del generador de dietas vive en el código: las instrucciones nutricionales son constantes TypeScript (`src/services/diet-generation-service.ts`, `src/constants/diet-examples.ts`) y el conocimiento clínico acumulado está en `vault/` como ficheros del repo, que el runtime no puede leer (regla dura 2: nada de filesystem en Vercel). Afinar una regla nutricional o incorporar un protocolo nuevo exige que un desarrollador edite código y despliegue, así que el nutricionista no puede iterar sobre el sistema que usa a diario.

Este change da al conocimiento y a las instrucciones un sitio editable y versionado en Supabase, y conecta ese sitio con la generación. Agrupa los cambios 2, 3 y 7 de la lista de mejoras porque son una sola pieza: el 7 (leer prompts + paciente + documentación antes de generar) es el mecanismo que conecta el 2 (prompts versionados) con el 3 (documentación versionada). Sin el 7 no hay nada que los lea; sin el 2 y el 3 no hay nada que leer.

## What Changes

- **Prompts versionados.** Cuatro tablas nuevas en Supabase con el patrón cabecera + versiones solo-inserción: `prompts` / `prompt_versiones` y `documentos_conocimiento` / `documento_versiones`. Una versión creada nunca se modifica ni se borra; activar es mover el puntero `version_activa_id`. Mismo principio de "nunca mutar, siempre añadir" que ya rige `pdf_path` / `pdf_source_hash`.
- **Documentación de conocimiento versionada.** Mismo ciclo que los prompts, con dos restricciones propias: el contenido se sube **solo en `.md`** (rechazado en cliente y revalidado en servidor, sin intentar conversión) y cada documento lleva `tipo` y `tags` para que el retrieval pueda filtrarlo.
- **Guardar y activar son acciones distintas.** "Guardar" crea una versión nueva sin tocar la vigente, de modo que un borrador a medias no afecta a ninguna generación en curso. "Activar esta versión" es el acto explícito que cambia el comportamiento del sistema. "Restaurar" una versión antigua crea una versión nueva con su contenido: el histórico no se reescribe nunca.
- **Paso de retrieval en la generación.** Antes de llamar al modelo, el sistema recupera la versión activa del prompt del tipo que toca y los documentos de conocimiento que apliquen al paciente. La selección es una query SQL por `tipo`/`tags` más los documentos marcados "siempre incluir": **no** hay búsqueda semántica ni una llamada extra al modelo para decidir relevancia.
- **El bloque cacheado pasa a ser dinámico-pero-estable.** Se mantiene el orden obligatorio del prompt; dentro del bloque estático entran, en este orden, el prompt activo, los documentos seleccionados y las dietas de ejemplo que ya existen. El bloque solo cambia cuando se activa una versión nueva, así que el cache-hit entre consultas consecutivas se conserva igual que hoy.
- **Fallback obligatorio.** Si el Cerebro está vacío, la query falla o Supabase no responde a tiempo, la generación SHALL seguir funcionando con las instrucciones por defecto que permanecen en el código. Una tabla vacía no puede romper una consulta.
- **Página "Cerebro"** con dos pestañas (Prompts y Documentación) sobre un mismo componente de editor versionado, y nueve route handlers bajo `/api/prompts/*` y `/api/documentos/*`. Sin Server Actions (regla dura 1).
- **Seed de los prompts actuales** como versión 1 activa, para que el día del despliegue el sistema se comporte exactamente igual que hoy, antes de que nadie toque nada desde la UI.

Fuera de alcance, cada uno con su propio OpenSpec: conversión de PDF a markdown y alta de paciente desde PDF (cambio 1), gate de validación de alergias (cambio 4), gráficas y descarga (cambio 5), asistente agéntico (cambio 6). Fuera de alcance también: embeddings / `pgvector`, aplicar el retrieval a la edición de una dieta ya generada, y permisos por usuario sobre quién puede activar (se asume usuario único/admin).

## Capabilities

### New Capabilities

- `prompt-versioning`: ciclo de vida de los prompts del sistema — un prompt por función (`generacion_dieta`, `extraccion_campos`, ...), historial inmutable de versiones, activación explícita, restauración de una versión antigua como versión nueva, y la UI que lo opera.
- `knowledge-documents`: ciclo de vida de los documentos de conocimiento — subida exclusivamente en `.md` validada en cliente y servidor, metadata (`tipo`, `tags`, "siempre incluir") que habilita el filtrado, historial inmutable, activación y restauración, y la UI que lo opera.
- `knowledge-retrieval`: selección, en el arranque de cada generación, del prompt activo que corresponde y del subconjunto de documentos aplicables al paciente, por metadata y no por similitud; su composición dentro del bloque cacheado y su comportamiento degradado cuando el Cerebro está vacío o no responde.

### Modified Capabilities

- `diet-generation`: el bloque estático del prompt deja de ser solo constantes del código. Cambian dos requisitos: "Generación del documento en una sola pasada" (las instrucciones que entran en contexto son ahora la versión activa del prompt `generacion_dieta`, con las del código como red de seguridad) y "Orden del prompt y caché del bloque estático" (el bloque sigue siendo idéntico byte a byte entre peticiones, pero su contenido cambia al activarse una versión nueva, lo que invalida la caché a propósito y hace que la siguiente generación pague una llamada en frío). "Las dietas de ejemplo viven en el código" no cambia: los ejemplos siguen siendo constantes.

## Impact

- **Supabase:** cuatro tablas nuevas y su migración en `supabase/migrations/`, con RLS por `created_by = auth.uid()` siguiendo el patrón de `patients` / `patient_consultations`. **No se toca Storage:** el markdown de los documentos vive en una columna `text`, no en el bucket `diets`; por tanto no hay buckets ni políticas nuevas. Son datos clínicos del negocio, no datos de salud de un paciente concreto, pero quedan igualmente detrás de RLS y nunca se sirven públicamente.
- **Generación:** `src/services/diet-generation-service.ts` compone el bloque estático a partir del retrieval en lugar de solo de constantes; `app/api/process-consultation/` añade el coste del retrieval a su presupuesto de `maxDuration = 60`, que ya está medido al límite (59,6 s en el peor caso registrado). El retrieval debe ser una query, no una llamada al modelo, precisamente por eso.
- **Rutas nuevas:** `GET/POST /api/prompts` y `/api/documentos` con sus subrutas `[id]/versiones` y `[id]/activar`. El retrieval no expone endpoint: es una función interna del servidor.
- **UI nueva:** `app/cerebro/` más componentes en `src/components/cerebro/`. Si algún listado usa TanStack Table, `data` y `columns` van memoizados (regla dura 3).
- **Trazabilidad:** con el historial inmutable se puede saber qué prompt y qué documentos estaban vigentes cuando se generó cada dieta — útil para RGPD y para explicar una dieta concreta a posteriori.
- **Migración puntual del vault:** `scripts/` (nunca importado desde `app/` ni `src/`, nunca desplegado) carga `vault/` en `documentos_conocimiento`. El recetario de 141 platos salió sucio de su conversión desde Word; se revisa antes de cargarlo o el problema llega a producción.
