# Vitalitty — Propuesta OpenSpec: Cerebro (Prompts + Documentación + Retrieval)

Oct 3, 2026 · @Juan

## Resumen y contexto

Este change (`cerebro-conocimiento-dinamico` en OpenSpec) agrupa los cambios 2, 3 y 7 de la lista de mejoras de Jesús porque son, en realidad, una sola pieza: el cambio 7 (leer prompts + paciente + documentación antes de generar) es el mecanismo que conecta los cambios 2 (prompts versionados) y 3 (documentación versionada) con el pipeline de generación. Construir 7 sin 2 y 3 no tiene sentido — no habría nada que leer — y construir 2 y 3 sin 7 dejaría la edición desconectada de la generación real.

Queda fuera de este change, cada uno con su propio OpenSpec: el alta de paciente desde PDF (cambio 1), el gate de validación de alergias (cambio 4), gráficas y descarga (cambio 5) y el asistente agéntico (cambio 6).

## Alcance

**Incluye:**

- CRUD versionado de prompts: crear, editar (siempre como nueva versión, nunca sobrescribir), activar una versión, ver histórico, volver a una versión anterior
- CRUD versionado de documentación: misma mecánica que los prompts, con la restricción de que el contenido subido debe estar en `.md`
- Página "Cerebro" en la UI, con dos pestañas: Prompts y Documentación
- Paso de selección (retrieval) integrado en el pipeline de generación de dieta: antes de llamar a Claude Opus, el sistema recupera la versión activa de cada prompt relevante y los documentos de conocimiento que apliquen al paciente

**No incluye:**

- Conversión de PDF a markdown (cambio 1, change aparte)
- Búsqueda semántica con embeddings/`pgvector` — la v1 selecciona documentos por tipo y tags (metadata), no por similitud vectorial; se deja la puerta abierta para añadirlo si el volumen de documentación lo justifica
- Aplicar este retrieval a la edición de una dieta ya generada — es trabajo futuro sobre el mismo mecanismo, no de este change
- Validación de alergias/patologías — es el cambio 4, que consumirá esta tabla de documentos pero se especifica aparte

## Modelo de datos en Supabase

Cuatro tablas nuevas, mismo patrón para prompts y documentación: una tabla "cabecera" con el puntero a la versión activa, y una tabla de versiones en modo solo-inserción (nunca `UPDATE` ni `DELETE` de una versión ya creada).

| Tabla                     | Columnas clave                                                                                                                                | Qué guarda                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `prompts`                 | `id`, `slug`, `nombre`, `tipo` (`generacion_dieta` / `extraccion_campos` / `validacion_alergias`...), `version_activa_id` (FK)                | Un prompt por función del sistema; apunta a su versión vigente        |
| `prompt_versiones`        | `id`, `prompt_id` (FK), `version` (int), `contenido` (text), `nota_cambio`, `created_at`                                                      | Historial completo e inmutable de cada edición de un prompt           |
| `documentos_conocimiento` | `id`, `slug`, `titulo`, `tipo` (`suplementacion` / `recetario` / `paper` / `protocolo` / `otro`), `tags` (text\[\]), `version_activa_id` (FK) | Un documento por tema; apunta a su versión vigente                    |
| `documento_versiones`     | `id`, `documento_id` (FK), `version` (int), `contenido_md` (text), `created_at`                                                               | Historial completo e inmutable de cada subida/edición de un documento |

**Por qué versionado como historial y no `UPDATE` in place:** mismo motivo que ya aplicáis con `pdf_path`/`pdf_source_hash` en dietas — nunca mutar, siempre añadir. Esto da tres cosas que necesitáis: rollback instantáneo (cambiar el puntero `version_activa_id`, no reescribir nada), que una generación en curso no se vea afectada por una edición a medio hacer de Jesús (lee la versión activa en el momento en que arranca, no lo que haya en pantalla en ese instante), y trazabilidad para RGPD — sabéis qué comportamiento/conocimiento estaba vigente cuando se generó cada dieta concreta.

## Estrategia de selección (retrieval)

&#91;embedded content: flujo de escritura (Cerebro) y de lectura (generación) · 6 componentes\]

Dos rutas comparten las mismas tablas. Jesús edita prompts y documentos desde la UI del Cerebro, que escribe una nueva versión en Supabase sin tocar la versión activa en uso. Al arrancar una generación, el paso de retrieval lee la versión activa de cada prompt relevante y filtra los documentos de conocimiento cuyo `tipo`/`tags` coincidan con el perfil del paciente (patologías, objetivo, tipo de actividad) — selección por metadata, no por similitud semántica, suficiente mientras el volumen de documentación sea manejable.

## Integración con el pipeline documento-primero

El orden actual para el prompt caching es: `[estático: instrucciones + dietas de ejemplo]` (cacheado) → `[contexto de paciente]` → `[transcripción]`. El bloque "estático cacheado" es justo donde entra el Cerebro, sin romper nada:

```
[estático, cacheado]
  1. Prompt activo de tipo "generacion_dieta"
  2. Documentos de conocimiento seleccionados (relevantes al tipo de paciente/objetivo)
  3. Ejemplos reales ya cacheados (lo que ya existe hoy)
[dinámico, no cacheado]
  4. Contexto del paciente concreto (patologías, alergias, histórico)
  5. Transcripción del audio de esta consulta
```

**Punto importante de caching:** el bloque estático solo cambia cuando Jesús activa una nueva versión de un prompt o documento — no en cada generación. Eso significa que el cache-hit se mantiene entre consultas consecutivas mientras no haya cambios en el Cerebro, igual que hoy. Si Jesús cambia algo, la siguiente generación paga el coste de una llamada en frío (como ya documentáis para medir velocidad), y a partir de ahí vuelve a cachear.

**Selección de documentos, en la práctica:** el paso de retrieval no decide "inteligentemente" qué documentos son relevantes con una llamada a IA aparte (eso añadiría latencia y coste) — es una query SQL: `tipo IN (...)` según el perfil del paciente (ej. `patologia = 'celiaquia'` → incluir documentos con tag `gluten`) más los documentos marcados como "siempre incluir" (el protocolo del Editor, por ejemplo). Si el volumen crece y el filtrado por metadata deja de ser preciso, ahí es donde se justificaría embeddings — no antes.

## UI: página "Cerebro"

Una página nueva con dos pestañas, mismo patrón de interacción en ambas:

**Pestaña Prompts**

- Listado de prompts por `tipo`, con la versión activa marcada
- Editor de texto plano al abrir uno; "Guardar" crea una versión nueva (nunca sobrescribe la activa en caliente)
- Botón explícito "Activar esta versión" — separado de "Guardar", para que Jesús pueda escribir un borrador sin que afecte a generaciones en curso
- Histórico de versiones por prompt, con diff simple (texto anterior vs. nuevo) y botón "Restaurar esta versión" (crea una versión nueva con el contenido de la antigua — nunca reescribe el historial)

**Pestaña Documentación**

- Zona de drag & drop / botón "Adjuntar", que **solo acepta `.md`** — cualquier otro formato (`.pdf`, `.docx`...) se rechaza en el cliente con un mensaje claro ("Sube el documento en formato Markdown (.md)"), no se intenta convertir
- Al subir: formulario con `tipo` y `tags` (para que el retrieval pueda filtrar luego)
- Mismo patrón de versionado, histórico y activación que los prompts
- Listado filtrable por `tipo`/`tags`

Ambas pestañas reutilizan el mismo componente de "editor versionado" para no duplicar lógica de UI — solo cambia qué formulario de metadata se muestra alrededor.

## Endpoints (route handlers)

Todos bajo `/api/...`, llamados vía `fetch` desde componentes cliente — se mantiene la regla del proyecto de no usar Server Actions.

| Método | Ruta                             | Qué hace                                                          |
| ------ | -------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/api/prompts`                   | Lista prompts con su versión activa                               |
| `GET`  | `/api/prompts/[id]/versiones`    | Histórico de versiones de un prompt                               |
| `POST` | `/api/prompts/[id]/versiones`    | Crea una nueva versión (no la activa)                             |
| `POST` | `/api/prompts/[id]/activar`      | Marca una versión como activa                                     |
| `GET`  | `/api/documentos`                | Lista documentos, filtrable por `tipo`/`tags`                     |
| `GET`  | `/api/documentos/[id]/versiones` | Histórico de versiones de un documento                            |
| `POST` | `/api/documentos`                | Sube un `.md` nuevo (valida extensión/contenido antes de guardar) |
| `POST` | `/api/documentos/[id]/versiones` | Nueva versión de un documento existente                           |
| `POST` | `/api/documentos/[id]/activar`   | Marca una versión como activa                                     |

La función de retrieval (selección de prompt activo + documentos relevantes) no necesita endpoint propio: vive como función interna, llamada desde dentro del route handler de generación de dieta que ya existe hoy.

## Tareas (orden de dependencia para OpenSpec)

| #   | Tarea                                                                                                                                                                                 | Depende de |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Migraciones: `prompts`, `prompt_versiones`, `documentos_conocimiento`, `documento_versiones`                                                                                          | —          |
| 2   | Seed: mover los prompts actuales (hardcoded en código) a `prompts`/`prompt_versiones` como versión 1 activa                                                                           | 1          |
| 3   | Endpoints CRUD de prompts (listar, nueva versión, activar)                                                                                                                            | 1          |
| 4   | Endpoints CRUD de documentos (listar, subir `.md`, nueva versión, activar) — incluye validación de extensión/formato en servidor, no solo en cliente                                  | 1          |
| 5   | Función de retrieval (lee prompt activo por `tipo` + filtra documentos por `tipo`/`tags` del paciente)                                                                                | 1          |
| 6   | Integrar retrieval en el route handler de generación de dieta existente, respetando el orden de prompt caching                                                                        | 5          |
| 7   | UI: página Cerebro, pestaña Prompts (listado, editor, histórico, activar/restaurar)                                                                                                   | 3          |
| 8   | UI: página Cerebro, pestaña Documentación (listado, drag&drop `.md`, editor, histórico, activar/restaurar)                                                                            | 4          |
| 9   | Migrar el vault actual (`vault/` en el repo, PR #44) a `documentos_conocimiento` vía script de carga puntual                                                                          | 4          |
| 10  | Pruebas: verificar que una generación con el Cerebro vacío usa los prompts por defecto (fallback), y que activar una versión nueva se refleja en la siguiente generación sin redeploy | 6, 7, 8    |

La tarea 2 es la más delicada: garantiza que el sistema sigue funcionando igual que hoy el día que se despliega esto, antes de que Jesús toque nada desde la UI.

## Riesgos y decisiones abiertas

- **Fallback si el Cerebro está vacío o la query falla**: la generación de dieta no puede romperse porque la tabla de documentos esté vacía o Supabase tarde en responder. Debe haber un prompt por defecto hardcoded como red de seguridad — a definir en la tarea 2.
- **Tamaño del bloque estático cacheado**: si Jesús activa muchos documentos "siempre incluir" a la vez, el bloque cacheado crece y puede acercarse a límites de contexto o encarecer el cache-write inicial. No es bloqueante para esta v1, pero conviene un aviso en la UI si el conjunto activo supera un umbral de tamaño.
- **Migración del vault existente (tarea 9)**: el recetario de 141 platos ya salió "sucio" de la conversión desde Word (nota pendiente que ya teníais apuntada) — antes de cargarlo a `documentos_conocimiento` conviene revisarlo, o se arrastra el problema a producción.
- **Quién puede activar una versión**: de momento se asume que es Jesús (usuario único/admin); si en el futuro hay más de un usuario con acceso al Cerebro, falta decidir permisos — fuera de alcance aquí, pero a tener en cuenta en el diseño de las tablas (ya incluyen `created_at`, fácil añadir `created_by` después).

**Verificación antes de cerrar el change:**

- [ ] Una generación con el Cerebro recién desplegado (sin que Jesús haya tocado nada) produce una dieta idéntica en calidad a la actual
- [ ] Activar una nueva versión de un prompt se refleja en la siguiente generación, sin redeploy
- [ ] Restaurar una versión anterior funciona y queda reflejado en el histórico
- [ ] Subir un archivo que no sea `.md` se rechaza con mensaje claro, en cliente y en servidor
- [ ] El cache-hit del prompt se mantiene entre generaciones consecutivas cuando no hay cambios en el Cerebro (medir igual que hoy)
- [ ] Con la tabla de documentos vacía, la generación no falla (usa el fallback)
