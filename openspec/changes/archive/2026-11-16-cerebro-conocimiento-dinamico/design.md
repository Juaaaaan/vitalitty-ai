# Design

## Context

Ver `proposal.md` — Why para la motivación. Lo que condiciona el enfoque:

- **El bloque estático se compone hoy en `src/services/diet-generation-service.ts`** a partir de constantes: las instrucciones y `DIET_EXAMPLES` (`src/constants/diet-examples.ts`). Ese bloque es el único marcado para caché y va primero; detrás van la memoria del paciente (`src/services/patient-context-service.ts`) y la transcripción.
- **El presupuesto de tiempo está al límite.** `POST /api/process-consultation` tiene `maxDuration = 60` y la peor generación medida fue **59,6 s** en navegador (paciente con 13 dietas). Cualquier cosa que el retrieval añada sale de ese margen, así que el retrieval tiene que ser una query y no una llamada al modelo.
- **Vercel serverless, sin filesystem** (regla dura 2). `vault/` existe en el repo pero el runtime no puede leerlo; por eso los documentos tienen que vivir en Postgres, y por eso la carga inicial del vault es un script local y no código de aplicación.
- **Sin Server Actions** (regla dura 1): toda escritura del Cerebro entra por un route handler bajo `/api/*` llamado con `fetch`.
- **El patrón "nunca mutar, siempre añadir" ya es el del proyecto**: `diet_version` lo asigna un trigger, el PDF es una caché validada por `pdf_source_hash`, una corrección de dieta crea una versión nueva. El Cerebro usa el mismo patrón para no introducir un modelo mental distinto.
- **Supabase con RLS por `created_by = auth.uid()`** en `patients` y `patient_consultations`; el cliente de la sesión es el que ejecuta, así que el aislamiento por usuario no lo garantiza el prompt sino la base de datos.

## Goals / Non-Goals

**Goals:**

- Que activar una versión cambie el comportamiento de la siguiente generación sin despliegue, y que eso sea el único momento en que el bloque cacheado cambia.
- Que el día del despliegue el sistema se comporte exactamente igual que el día anterior, antes de que nadie toque la UI.
- Que un Cerebro vacío, lento o caído no pueda dejar una consulta sin dieta.
- Que prompts y documentos compartan mecánica (cabecera + versiones solo-inserción, guardar ≠ activar) y, en la UI, el mismo componente de editor versionado.

**Non-Goals:**

- Similitud semántica / `pgvector`. La v1 filtra por metadata; los embeddings se justifican cuando el filtrado por metadata deje de ser preciso, no antes.
- Permisos finos sobre quién puede activar. Se asume usuario único/admin por usuario de Supabase; las tablas llevan `created_by` y `created_at`, que es lo que hace falta para añadirlo después.
- Convertir PDF/DOCX a markdown, y aplicar el retrieval a la edición de una dieta ya generada.
- Registrar en cada consulta qué versiones exactas se usaron. La trazabilidad de esta v1 es reconstructiva (historial + fechas), no una FK por consulta; ver Open Questions.

## Decisions

### 1. Cabecera + tabla de versiones solo-inserción, en lugar de `UPDATE` in place

Cuatro tablas: `prompts` / `prompt_versiones` y `documentos_conocimiento` / `documento_versiones`. La cabecera lleva la identidad estable (`slug`, `tipo`, `tags`) y un `version_activa_id` que apunta a su versión vigente; la tabla de versiones es inmutable (`version` consecutivo por padre, `contenido`, `nota_cambio`, `created_at`, `created_by`).

Esto da tres cosas que un `UPDATE` sobre una fila única no da: rollback instantáneo (mover el puntero, no reescribir texto), inmunidad del runtime a un borrador a medias (la generación lee la versión activa, no lo que haya en pantalla), y trazabilidad.

La inmutabilidad se defiende en la base de datos, no por convención: política RLS de `INSERT`/`SELECT` sobre las tablas de versiones, sin `UPDATE` ni `DELETE`, y el `version` lo asigna un trigger a partir del máximo del padre — el mismo mecanismo que ya asigna `diet_version`, para que dos guardados concurrentes no colisionen.

**Alternativa descartada: una sola tabla con `UPDATE` y una columna `historial jsonb`.** Menos tablas, pero el historial deja de ser consultable con SQL normal, el rollback vuelve a ser una reescritura, y la inmutabilidad pasa a depender de que nadie escriba el `UPDATE` equivocado. Descartada por eso.

**Alternativa descartada: guardar el markdown en el bucket `diets` y la metadata en Postgres.** Es lo que se hace con `diet_md`, pero ahí el fichero es un entregable del paciente; aquí el contenido se lee en cada generación y se compara entre versiones. Una columna `text` evita una descarga firmada por documento dentro del presupuesto de 60 s. **No se toca Storage: ni bucket nuevo ni políticas nuevas.**

### 2. El retrieval es una query SQL, no una llamada al modelo

La selección de documentos cruza `tipo` y `tags` con el perfil del paciente (patologías, objetivo, tipo de actividad) y suma los marcados de inclusión incondicional (`siempre_incluir`), en una sola consulta con `JOIN` a la versión activa. Un documento sin versión activa no entra. El resultado se deduplica y se ordena de forma determinista (por `slug`) — el orden importa, ver decisión 3.

**Alternativa descartada: pedirle al modelo de extracción qué documentos son relevantes.** Sería más preciso con mucho conocimiento, pero añade una llamada y su latencia a un presupuesto donde la peor generación ya mide 59,6 s contra `maxDuration = 60`, y encarece cada consulta. Descartada mientras el volumen de documentación sea manejable.

**Alternativa descartada: `pgvector` + embeddings.** Mismo motivo de volumen, más el coste de mantener el índice y de reindexar en cada activación. Las tablas no impiden añadirlo después: sería una columna más en `documento_versiones`.

### 3. Dónde cae el corte de la caché

El orden del prompt no cambia; cambia de dónde sale la primera parte:

```
[estático, marcado para caché]          <- el corte de la caché va justo detrás de esto
  1. prompt activo de tipo generacion_dieta   (BD, o constante del código como fallback)
  2. documentos de conocimiento seleccionados (BD, orden determinista por slug)
  3. dietas de ejemplo                        (constantes, como hoy)
[dinámico, fuera del prefijo cacheado]
  4. memoria del paciente
  5. transcripción o instrucción de esta consulta
```

El bloque estático va primero porque el prefijo cacheado tiene que ser un prefijo: en cuanto un byte específico del paciente se cuela antes del corte, deja de haber nada reutilizable y la caché no sirve de nada. Que ahora el contenido venga de la base de datos no rompe eso — lo que la caché exige es que el bloque sea **idéntico byte a byte entre peticiones**, no que esté hardcodeado. Y lo es, porque solo cambia al activar una versión: no entran ni `created_at`, ni ids de versión, ni el número de versión, ni timestamps; solo el contenido, concatenado en orden determinista.

El corolario es deliberado: activar una versión **invalida la caché**, y la primera generación posterior paga una llamada en frío. Es el precio correcto — es exactamente el cambio que se quería que surtiera efecto sin despliegue.

**Alternativa descartada: dos bloques cacheados, uno para el prompt y otro para los documentos.** Dejaría intacta la caché del prompt cuando solo cambia un documento, pero la caché es de prefijo: el segundo bloque se invalida igual y el ahorro se limita al primero, a cambio de más piezas en el ensamblado. No merece la complejidad en la v1.

**Alternativa descartada: no meter los documentos en el bloque cacheado, ponerlos junto al paciente.** Serían gratis de invalidar, pero se facturarían íntegros en **cada** generación, que es justo lo contrario de lo que se quiere: el recetario de 141 platos es grande y se repite entre consultas.

### 4. Fallback: la constante del código sigue siendo la red de seguridad

Las instrucciones actuales no se borran del código al mover la generación a la BD: se quedan como `DEFAULT_PROMPTS` y son lo que se usa si no hay versión activa, si la query falla o si agota su margen de tiempo. El retrieval se ejecuta con un presupuesto propio corto; al expirar, devuelve el conjunto por defecto y la generación sigue. El camino degradado se registra en el servidor y **no** se muestra al usuario a mitad de consulta: lo que no puede pasar es que una tabla vacía deje una consulta sin dieta.

La semilla (tarea 2) inserta esas mismas constantes como versión 1 activa, de modo que el día del despliegue el bloque estático es byte a byte el de hoy y la dieta generada es la de hoy.

**Alternativa descartada: fallar la generación si el Cerebro no responde.** Más honesto en abstracto, pero el fallo cae sobre una consulta grabada que ya no se puede repetir: el nutricionista tiene al paciente delante. Descartada.

**Alternativa descartada: cachear en memoria del proceso el último conjunto bueno.** En serverless las instancias son efímeras y no compartidas; una caché así acierta de forma impredecible y además puede servir una versión que ya se desactivó. Descartada.

### 5. El retrieval es una función interna, sin endpoint propio

Vive como servicio (`src/services/brain-retrieval-service.ts`) y lo llama el route handler de generación con el cliente Supabase de la sesión. No se expone por HTTP: no hay cliente que lo necesite y exponerlo sería una superficie más que vigilar. Que use el cliente de la sesión es lo que hace que RLS — y no el prompt — sea lo que impide que el conocimiento de un usuario entre en la generación de otro.

**Alternativa descartada: un `GET /api/cerebro/contexto` que el cliente llame antes de generar.** Dejaría ver el conjunto seleccionado desde el navegador (útil para depurar), pero añade un viaje de red dentro del presupuesto de 60 s y permite al cliente decidir qué entra en contexto, que es precisamente lo que no debe poder hacer.

### 6. La validación de `.md` se hace dos veces, a propósito

El cliente rechaza por extensión y tipo antes de subir, para que el usuario tenga respuesta inmediata y un mensaje claro ("Sube el documento en formato Markdown (.md)"). El servidor revalida porque una petición puede llegar sin pasar por el cliente. No se intenta ninguna conversión.

**Alternativa descartada: validar solo en servidor.** Más simple, pero obliga a subir el fichero entero para enterarse — y Vercel limita el tamaño del body de una función serverless, así que un PDF grande puede fallar con un error genérico en lugar del mensaje correcto. Por eso el cliente rechaza primero por extensión, y el documento viaja como texto, no como fichero binario.

### 7. Un solo componente de editor versionado para las dos pestañas

`src/components/cerebro/` expone un editor versionado (textarea, Guardar, Activar, histórico con diff y Restaurar) al que cada pestaña envuelve con su propio formulario de metadata: tipo y nombre para prompts; tipo, tags y `siempre_incluir` para documentos. El diff es textual línea a línea, calculado en cliente.

**Alternativa descartada: un editor por pestaña.** Duplicaría la lógica de guardar/activar/restaurar, que es la parte con reglas y la que más fácil se desincroniza entre las dos.

Si algún listado usa TanStack Table, `data` y `columns` van en estado o `useMemo` (regla dura 3): un array literal construido en render congela la pestaña sin error ni traza.

## Risks / Trade-offs

- **El retrieval se come margen de un presupuesto ya ajustado (59,6 s contra 60).** → Una sola query con `JOIN`, nunca una llamada al modelo; presupuesto propio corto con caída al fallback al expirar. Además es un argumento más para subir `maxDuration` en el plan de despliegue, que ya estaba pendiente antes de este cambio.
- **El bloque cacheado crece sin control si se marcan muchos documentos como incondicionales.** → Aviso informativo en la pestaña Documentación al superar un umbral de tamaño, sin bloquear la acción. No es bloqueante para la v1, pero el recetario de 141 platos ya da la escala del problema.
- **La semilla es el punto delicado del change.** Si el contenido sembrado no es byte a byte el de la constante, la primera generación tras el despliegue cambia de comportamiento sin que nadie haya tocado nada. → La semilla lee la constante del propio código en lugar de una copia pegada a mano, y la verificación incluye comparar el bloque estático antes y después.
- **El vault llega sucio.** El recetario de 141 platos salió mal de su conversión desde Word. → La carga (tarea 9) es un script puntual y revisable, va después de los endpoints y no es requisito para cerrar el resto; se revisa antes de cargar o el problema llega a producción.
- **Dar al nutricionista el prompt de generación le deja romper el contrato del documento.** Un prompt editado puede pedir macros o inventar secciones, y entonces la plantilla no reconoce la salida y el PDF sale mal. → El contrato sigue viviendo en `src/constants/diet-pdf/diet-contract.ts` y se concatena siempre después del prompt activo, como parte no editable del bloque; la vista previa de `/diets` ya expone una salida que no cumple el contrato antes de aprobar nada. El gate duro de validación es el cambio 4, aparte.
- **Dos usuarios, un Cerebro cada uno.** El aislamiento por RLS significa que el conocimiento no se comparte entre usuarios; si en el futuro se quiere conocimiento común, hace falta un concepto nuevo (documento global) que esta v1 no tiene. → Aceptado: hoy el usuario es uno.

## Migration Plan

1. **Migración de las cuatro tablas** con RLS (`created_by = auth.uid()`), trigger de `version` y la restricción de solo-inserción en las tablas de versiones. Hasta aquí nada las lee: el despliegue es inerte.
2. **Semilla de los prompts actuales** como versión 1 activa, tomando el contenido de las constantes del código. Sigue siendo inerte: el retrieval todavía no está conectado.
3. **Endpoints y UI**, que ya permiten crear versiones y activarlas sin que afecte a la generación.
4. **Conectar el retrieval a la generación.** Es el único paso que cambia el comportamiento. Antes y después se compara el bloque estático: si no es idéntico, la semilla está mal.
5. **Carga del vault** como script puntual, una vez revisado el recetario.

**Rollback:** el paso 4 es el único con efecto observable y se revierte desactivando el consumo del retrieval — la generación vuelve a las constantes del código, que no se han borrado. Dentro del Cerebro, el rollback de un cambio de contenido no necesita despliegue: es activar la versión anterior. Las tablas pueden quedarse: nadie las lee si el paso 4 está revertido.

## Open Questions

- **Umbral de tamaño para el aviso del conjunto incondicional.** Hace falta medir el tamaño real de los documentos del vault antes de fijar una cifra; el aviso es informativo y no condiciona especs ni tareas.
- **Registrar en cada consulta las versiones exactas usadas** (FK a `prompt_versiones` / `documento_versiones` desde `patient_consultations`). Haría la trazabilidad exacta en lugar de reconstructiva. Se puede añadir después sin tocar nada de esta v1, y por eso queda fuera.
