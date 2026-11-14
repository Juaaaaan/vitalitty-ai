# Verificación pendiente

Lo que falta para cerrar el change, y por qué no se pudo hacer desde aquí. El
código está completo y con tests; lo que queda necesita una base de datos real y
una sesión en el navegador.

Estado al 2026-10-03, rama `cerebro-conocimiento-dinamico`.

## Hecho y verificado automáticamente

- `npm run lint`: 0 errores (5 avisos, todos previos al change).
- `npx tsc --noEmit`: limpio.
- `npx vitest run`: **410 tests en 41 ficheros**, todos en verde. Incluye 15 de
  los endpoints de prompts, 16 de los de documentos, 16 del retrieval, 13 del
  bloque estático y 9 de la UI del Cerebro.
- `npm run build`: compila y publica las 7 rutas nuevas y `/cerebro`.
- **Igualdad byte a byte**: `src/services/__tests__/fixtures/static-prompt-block.before.txt`
  guarda el bloque estático tal y como lo producía el código antes del change, y
  `static-prompt-block.test.ts` comprueba que el prompt sembrado compone
  exactamente ese texto. Es lo que hace válida la semilla.

## ✅ 1. Migración aplicada y verificada (tareas 1.1–1.4)

Aplicada al proyecto `vitalitty-ai` (`apijxjakeffswxpiresl`) el 2026-10-03, con
autorización explícita, después de que la rama de Supabase resultara imposible:
`Branching is supported only on the Pro plan or above`.

Comprobado sobre la base de datos real:

| Tarea     | Resultado                                                                                                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 / 1.2 | Las cuatro tablas existen con sus FK cruzadas (`version_activa_id` → tabla de versiones, y la versión → su cabecera).                                                                                                                                                                  |
| 1.3       | Las tablas de versiones tienen **solo** `INSERT` y `SELECT`; las cabeceras, `INSERT`, `SELECT` y `UPDATE`. Como usuario autenticado: ve 1 de sus filas, 0 de las de otro `sub`, y un `update` sobre una versión propia afecta a **0 filas**.                                           |
| 1.4       | Tres inserciones seguidas sobre el mismo padre dieron `version` 1, 2 y 3; una inserción con `version = 2` explícita fue rechazada por el índice único. La serialización de dos inserciones concurrentes descansa en el mismo `pg_advisory_xact_lock` que ya usa `assign_diet_version`. |

Las pruebas corrieron dentro de un bloque que termina lanzando una excepción, así
que se deshicieron solas: las cuatro tablas quedaron a 0 filas y las 27 consultas
existentes intactas. Los advisors de seguridad no señalan ninguna de las tablas
nuevas (sus dos avisos son previos: `update_updated_at_column` sin `search_path`
y la protección de contraseñas filtradas de Auth).

**Rollback**, si alguna vez hace falta:

```sql
drop table public.documento_versiones, public.documentos_conocimiento,
           public.prompt_versiones, public.prompts cascade;
drop type public.knowledge_document_type;
```

## ✅ 2. Prompt sembrado (tarea 2.2)

`.env.local` no tiene `SUPABASE_SERVICE_ROLE_KEY`, así que `scripts/seed-prompts.ts`
no se pudo ejecutar; se sembró por SQL con la misma comprobación que hace el
script. La versión 1 de `generacion-dieta` está activa y su contenido mide **5846
caracteres con md5 `cd53639453541f910ccd0ce1d0a274b9`, idéntico al de la constante
`DEFAULT_PROMPTS`**. Leído luego con la forma exacta de `readActivePrompt`, como
usuario autenticado: mismo md5 y marcador del contrato presente.

`SUPABASE_SERVICE_ROLE_KEY` se añadió a `.env.local` después, y el script se
ejecutó en seco contra la base de datos real:

```
· generacion-dieta: already seeded, left untouched
Dry run, nothing written.
```

Es decir, es idempotente: reconoce lo ya sembrado y no duplica. Para re-sembrar
hace falta `--force`, que añade una versión nueva y la activa, sin tocar la v1.

## ~~1. Aplicar la migración~~ (hecho, ver arriba)

No se aplicó: el repo no trae `supabase/config.toml`, así que no hay stack local
que levantar, y la creación de una rama de Supabase para probarla ahí quedó
denegada. Opciones, en orden de menor riesgo:

```bash
# a) con el CLI de Supabase, contra una rama o un proyecto de pruebas
supabase link --project-ref <ref>
supabase db push

# b) aplicando el fichero tal cual al proyecto
#    supabase/migrations/20261003120000_create_brain_prompts_and_documents.sql
```

La migración es **aditiva**: crea el enum `knowledge_document_type`, las cuatro
tablas, sus índices, dos triggers de versión y sus políticas RLS. No altera
`patients` ni `patient_consultations`. Deshacerla es un `drop` manual de esas
cinco cosas.

Qué comprobar después:

| Tarea     | Comprobación                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 / 1.2 | Las cuatro tablas existen con sus FK, y `version_activa_id` apunta a su tabla de versiones.                                                                             |
| 1.3       | Con dos usuarios: ninguno ve las filas del otro, y un `update` sobre una fila de `prompt_versiones` o `documento_versiones` es rechazado (no hay política de `UPDATE`). |
| 1.4       | Dos inserciones concurrentes sobre el mismo padre no repiten `version` (el `pg_advisory_xact_lock` las serializa).                                                      |

`npm run build` ya cubre la parte de 1.5 que aplica; **no hay tipos de Supabase
que regenerar**: este repo no tiene fichero de tipos generados y el cliente se
usa sin tipar.

## ~~2. Sembrar los prompts~~ (hecho, ver arriba)

```bash
SUPABASE_SERVICE_ROLE_KEY=... node --no-warnings --env-file=.env.local \
  scripts/seed-prompts.ts --user <tu auth user id> --dry-run   # primero en seco
SUPABASE_SERVICE_ROLE_KEY=... node --no-warnings --env-file=.env.local \
  scripts/seed-prompts.ts --user <tu auth user id>
```

El script lee el contenido de `DEFAULT_PROMPTS` —no una copia pegada— y, tras
insertar, vuelve a leer de la base de datos y aborta si lo guardado no coincide
carácter a carácter con la constante. Si imprime `✓ generacion-dieta: v1 active
… identical to the constant`, la tarea 2.2 está verificada.

## ⚠️ 3. Comprobación 10.1 — reabierta el 2026-11-14

**Se dio por hecha y no lo estaba.** La dieta que se revisó salió de un paciente
con 24 consultas, y el modelo no la generó: **copió la anterior**. Con la cadena
de versiones delante no hay duda —tres transcripciones distintas, la misma dieta
byte a byte, cambiando solo el número de versión del frontmatter:

```
v21  2026-09-30  11549 chars  md5 c39337bc08   transcripción:   0 ch
v22  2026-11-14  11549 chars  md5 c39337bc08   transcripción: 315 ch
v23  2026-11-14  11549 chars  md5 c39337bc08   transcripción: 492 ch
v24  2026-11-14  11549 chars  md5 c39337bc08   transcripción: 492 ch (otro hash)
```

La v22 es anterior al arreglo del embed, así que **esto no lo trae este change**:
es la memoria del paciente. `patient-context-service.ts` mete `lastDietMd` —la
última dieta completa— después del bloque estático, y el modelo la reproduce en
lugar de generar. Las v17, v19, v20 y v21 además se generaron con transcripción
de 0 caracteres, solo con memoria: ahí arranca el eco.

Dos consecuencias para este change:

- **10.1 no prueba nada sobre el prompt sembrado** mientras se haga sobre un
  paciente con historial. Hay que repetirla por la vía de **paciente nuevo**, que
  no tiene memoria ni `lastDietMd`: así el modelo solo tiene el prompt activo, el
  vault, las dietas de ejemplo y la transcripción.
- **El efecto del vault es invisible en un paciente con historial.** La
  generación con el Cerebro metió 18.316 tokens de conocimiento y la dieta salió
  idéntica. No es que el conocimiento no entre —entra, y se ve en el contador de
  caché—: es que la última dieta pesa más.

El defecto de la memoria es anterior y más amplio que este change (CLAUDE.md ya
anota "Patient memory can't forget"; esto es más fuerte: reproduce la última
dieta literalmente). Merece su propio change, no un parche aquí.

## ✅ 3-bis. Lo que la carga del vault sí esperaba

**2026-11-14: generada una dieta en `/diets` con el Cerebro recién sembrado (solo
el prompt v1, 0 documentos) y revisada por el usuario: correcta y equivalente a
las de siempre.** Esa es la referencia limpia de "una dieta como las de hoy", y
es lo que hacía de puerta a la carga del vault. El paso 1 del orden acordado
queda cerrado; sigue el 2 (limpiar el recetario de 141 platos).

## ✅ 4. Vault cargado (tarea 9.2)

**2026-11-14.** Limpiado el recetario (ver `vault-review.md`), `load-vault.ts`
corrió contra la base de datos real y entraron los seis ficheros con contenido,
cada uno con su v1 activa. `index.md` se salta por vacío, como estaba previsto.

Comprobado leyendo luego la base de datos y comparando md5 contra el fichero de
`vault/`: **6 documentos, 6 versiones, md5 idéntico en los seis.**

| Documento                                                     | Tipo             | Entra por                                    | Caracteres |
| ------------------------------------------------------------- | ---------------- | -------------------------------------------- | ---------- |
| PROTOCOLO MAESTRO PROMPTS EDITOR VITALITTY v2                 | `protocolo`      | **siempre incluir**                          | 39.506     |
| COMPENDIO PUBMED VITALITTY                                    | `paper`          | `hipertrofia` `microbiota` `pms` `evidencia` | 50.546     |
| Fuentes cientificas Vitalitty 01 Hipertrofia Microbiota Mujer | `paper`          | `hipertrofia` `microbiota` `pms` `mujer`     | 21.870     |
| Biblioteca Maestra Suplementacion Vitalitty v1                | `suplementacion` | `suplementacion` `creatina` `proteina`       | 21.894     |
| VITALITTY Recetario Maestro 141 Platos                        | `recetario`      | `platos`                                     | 31.699     |
| VITALITTY Ampliacion Banco Maestro 50 Platos                  | `recetario`      | `platos`                                     | 11.547     |

Lo que esto cambia, y hay que vigilar ahora:

- **El bloque estático crece en 39.506 caracteres en toda generación** (el
  protocolo del editor), más lo que cruce por etiquetas. La medición 6.5 / 10.4
  pasa de "conviene" a "hace falta": el peor caso conocido eran 59,6 s contra
  `maxDuration = 60`.
- **El paso 4 del orden acordado está pendiente**: generar otra dieta y ver el
  efecto del conocimiento, ahora sí con el vault dentro.
- Los títulos siguen saliendo del nombre del fichero. Es metadata: se reescriben
  desde `/cerebro` sin crear versión.

Deshacerlo, si hiciera falta, pide la service-role key (las tablas de versiones
no tienen política de `DELETE`):

```sql
delete from public.documento_versiones;
delete from public.documentos_conocimiento;
```

### Por qué la carga esperaba

En cuanto el vault entre, las dietas cambian — el protocolo del editor está
planeado como "siempre incluir" (39.506 caracteres en toda generación) y los
demás entran en cuanto sus etiquetas (`hipertrofia`, `microbiota`, `pms`…) cruzan
con la ficha del paciente. Cargarlo antes de 10.1 destruiría la referencia limpia
de "una dieta como las de hoy".

Orden acordado:

1. ~~Generar una dieta en `/diets` con solo el prompt sembrado y 0 documentos, y
   confirmar que sale equivalente a las de siempre (10.1).~~ **Hecho el
   2026-11-14.**
2. Arreglar el recetario de 141 platos según `vault-review.md`.
3. Cargar: `node --no-warnings --env-file=.env.local scripts/load-vault.ts --user <id>`.
4. Generar otra vez y ver el efecto del conocimiento.

La prueba en seco ya corrió contra la base de datos real y hace lo previsto:

```
· Biblioteca_Maestra_Suplementacion_Vitalitty_v1.md: would load … (suplementacion, 21894 chars)
· COMPENDIO_PUBMED_VITALITTY_01-10-2026.md: would load … (paper, 50546 chars)
· Fuentes_cientificas_Vitalitty_01_Hipertrofia_Microbiota_Mujer.md: would load … (paper, 21870 chars)
· PROTOCOLO_MAESTRO_PROMPTS_EDITOR_VITALITTY_v2_01-10-2026.md: would load … (protocolo, always included, 39506 chars)
· VITALITTY_Ampliacion_Banco_Maestro_50_Platos.md: would load … (recetario, 11547 chars)
✗ VITALITTY_Recetario_Maestro_141_Platos.md: no markdown headings; carries an <img> tag; HTML tables instead of markdown. Clean it up or re-run with --force.
· index.md: empty, skipped
```

Un detalle cosmético: los títulos salen del nombre del fichero, así que quedan
como "COMPENDIO PUBMED VITALITTY 01 10 2026". Se pueden reescribir desde
`/cerebro` sin crear versión, porque el título es metadata.

## ✅ 6. Bug encontrado al verificar en navegador: el embed ambiguo

Arreglado en `fix(brain): name the foreign key when embedding the active version`.

**El Cerebro nunca llegó a leer de la base de datos.** Entre cada cabecera y su
tabla de versiones hay dos relaciones —la versión apunta a su cabecera, la
cabecera a su versión activa—, y un embed que no nombra la FK lo rechaza
PostgREST con `PGRST201`. Las cuatro queries del Cerebro lo hacían así.

En el retrieval el fallo era invisible **por diseño**: no lanza nunca, así que la
generación se iba al camino degradado y salía una dieta sin Cerebro, dejando una
línea de log que nadie miraba. En `listPrompts` y `listKnowledgeDocuments` habría
dado un 500 en `/cerebro`.

Los 410 tests no lo vieron porque el doble de Supabase **unía siempre por la FK
del padre e ignoraba el hint**: modelaba una base de datos que no existe. Ahora
resuelve las dos relaciones y responde `PGRST201` a un embed sin cualificar, como
la real — y al corregirlo aparecieron los otros dos casos, que estaban igual de
roto sin que nadie lo supiera. Dos tests fijan ese comportamiento.

Verificado contra la base real, las cuatro:

| Query                                     | Antes      | Ahora                       |
| ----------------------------------------- | ---------- | --------------------------- |
| retrieval, prompt activo                  | `PGRST201` | 5.846 chars                 |
| retrieval, documentos (tag `hipertrofia`) | `PGRST201` | 3 documentos, 111.922 chars |
| `listPrompts`                             | `PGRST201` | v1 activa resuelta          |
| `listKnowledgeDocuments`                  | `PGRST201` | 6/6 versiones resueltas     |

De regalo, nombrar la FK hace el embed uno a uno: llega la versión activa y solo
ella, en lugar del markdown de todas las versiones.

### Aparte, y previo a este change

`POST /api/compare-diets` con el cuerpo vacío lanza `SyntaxError: Unexpected end
of JSON input` en `route.ts:20` y **responde 200**. Debería ser un `400` con
`error`, como el resto de las rutas. No toca a este change.

## ✅ 5. Coste del retrieval medido (tarea 6.5)

Dos generaciones seguidas en local, mismo audio y mismo paciente, una antes del
arreglo del embed y otra después:

|                                      | 1ª (camino degradado) | 2ª (con el Cerebro) |
| ------------------------------------ | --------------------- | ------------------- |
| retrieval                            | `query_failed`        | OK                  |
| `cacheCreationInputTokens`           | 4.518                 | **22.834**          |
| `cacheReadInputTokens`               | 0                     | 0                   |
| `inputTokens`                        | 6.691                 | 6.654               |
| `outputTokens`                       | 5.746                 | 5.746               |
| total de `/api/process-consultation` | 51 s                  | **51 s**            |

**El bloque estático se multiplica por cinco y el tiempo total no se mueve.** El
retrieval son dos queries por metadata sobre tablas pequeñas; no consume margen
apreciable de `maxDuration = 60`. Los 59,6 s del peor caso conocido eran un
paciente con 13 dietas, no este, así que ese caso sigue sin medir con el Cerebro
dentro.

`cacheReadInputTokens: 0` en las dos es lo correcto: el bloque cambió entre una y
otra. El cache-hit de 10.4 pide una tercera generación sin tocar nada.

## ✅ 7. Decisiones del 2026-11-14 sobre tiempo y alcance del vault

**`maxDuration` sube a 180 s** en `/api/process-consultation` y en
`/api/assistant/confirm`, las dos rutas que generan una dieta. Lo fuerza una
medida, no una precaución: con el dictado completo de 4 minutos y el Cerebro
sembrado, una generación tardó **86 s**. A 60 s Vercel corta esa ejecución
_después_ de pagar el modelo, y como el `insert` ocurre al cerrarse el stream,
la dieta no se guarda y el audio no se repite.

**Esto requiere un plan de Vercel que admita más de 60 s.** Hobby lo limita a 60
y rechaza el despliegue con un valor mayor. Si el plan no da, la conversación
pasa a ser de hosting, no de código: las alternativas serían acortar la salida o
partir la generación, no bajar el número y cruzar los dedos.

Las otras rutas se quedan en 60: el bucle del asistente no genera, y
`/api/diet-pdf`, `/api/compare-diets` y `/api/diet-portions` no han dado señal
de necesitarlo. Un test fija el de `diet-pdf`.

**Los dos recetarios pasan a `siempre_incluir`**, por decisión de la
nutricionista: cuanta más información en contexto, más precisa la dieta. Son un
banco de platos, así que aplican a cualquier paciente y por etiqueta no cruzaban
nunca —ninguna ficha dice "platos"—. El coste es explícito:

| Documentos de inclusión incondicional    | 3      | 82.752 caracteres en **toda** generación |
| ---------------------------------------- | ------ | ---------------------------------------- |
| Seleccionados para el paciente de prueba | 6 de 6 | 177.062 caracteres                       |

El bloque estático queda en ~57k tokens (era 22,8k en la medida de los 86 s), así
que **el tiempo va a subir y hay que volver a medirlo con los 180 s puestos**.
Sigue por debajo del umbral del aviso de 8.4 (120.000 caracteres de inclusión
incondicional), que mira solo los `siempre_incluir`.

## ✅ 8. Pestañas Prompts y Documentación verificadas (7.x y 8.x)

Recorridas en navegador con Playwright el 2026-11-14, contra la base real.
**Destaparon dos bugs del editor versionado**, los dos arreglados y con test que
falla sin el arreglo.

### Bug 1 — el editor arrancaba vacío

`/cerebro` cargaba, el prompt salía con su `v1` marcada… y el textarea en blanco,
con 5.846 caracteres en la base de datos. El editor se siembra de la versión
activa **al montarse**, a propósito, para no sincronizar estado en un efecto; el
padre lo remonta con `key`. El problema: se montaba antes de que el histórico
llegara, y su `key` no cambiaba al llegar, así que el borrador se quedaba vacío
para siempre. Arreglado no montando el editor hasta que las versiones del
elemento seleccionado están cargadas (`versionsFor`).

Los tests no lo veían porque le pasaban las versiones ya cargadas.

### Bug 2 — tras activar, el editor mostraba la versión anterior

Más sutil y más peligroso. Al activar una versión, `activate` recarga listado e
histórico con un `Promise.all`, y sus `setState` caen en microtasks distintas, así
que React puede confirmar el listado primero: el editor se remontaba con la `key`
nueva mientras el histórico seguía marcando activa la versión anterior. En
pantalla, el subtítulo anunciaba **147 caracteres** y el textarea mostraba los
**122** de la versión vieja. Guardar encima habría creado una versión con el
contenido anterior, silenciosamente.

Arreglado derivando la `key` de las **mismas** versiones de las que se siembra el
editor, no de lo que diga el listado. El test necesita retrasar la respuesta del
histórico para reproducir el desfase: sin ese retraso las dos respuestas entran
en el mismo lote de React y el fallo no aparece.

### Lo comprobado

| Tarea     | Resultado                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 / 7.2 | Carga, cambia de pestaña, "Generación de dieta" con su versión activa marcada y el editor con los 5.846 caracteres de la base                                                                                       |
| 7.3       | Guardar → "Guardado como versión nueva. No está activa todavía", activa sigue en v1, histórico pasa a 2. Activar → v2, y tras recargar sigue en v2, con "Activa desde" en la hora de activación y no la de creación |
| 7.4       | Ver cambios enseña el diff en verde de lo añadido. Restaurar carga el contenido antiguo sin guardar ni activar; al guardar sale una v3 y v1 y v2 quedan intactas, sin reutilizar número                             |
| 7.5       | No aplica tal cual: ningún listado del Cerebro usa TanStack Table. Comprobado que no se congela al abrir ni al filtrar                                                                                              |
| 8.1       | Soltado un `.pdf`: sale "Sube el documento en formato Markdown (.md)." y en la pestaña de red **solo los dos GET del listado, ningún POST**                                                                         |
| 8.2       | Subido un `.md`: aparece con su tipo, su versión y sus etiquetas. Filtro por etiqueta `platos` → 2; filtro combinado `paper` + `platos` → 0 con "No hay documentos con ese filtro."                                 |
| 8.3       | Ciclo completo sobre ese documento: Guardar no activa, Activar mueve el puntero y el editor lo sigue, Restaurar carga el contenido antiguo sin tocar nada                                                           |
| 8.4       | Marcado el compendio de PubMed como incondicional: el aviso sale con el total exacto —**133.298 caracteres** sobre el umbral de 120.000— y la acción se completa igual. Desmarcado después: vuelta a 82.752         |

El Cerebro quedó como estaba: el prompt activo es la **v3**, con md5
`cd53639453541f910ccd0ce1d0a274b9`, idéntico al sembrado, y los incondicionales
son los tres acordados. Queda en la base el documento de prueba
`prueba-verificacion-8-2` (147 caracteres, etiquetas `prueba` y `verificacion`,
no incondicional): no entra en ninguna generación porque ninguna ficha dice esas
palabras, pero conviene borrarlo.

## 4. Comprobaciones en navegador (tareas 7.x, 8.x, 10.x)

Con la migración aplicada y los prompts sembrados, `npm run dev` y:

1. **7.1 / 7.2** — Abre `/cerebro` (está en la barra lateral, "Cerebro →
   Prompts y documentación"). Debe cargar, cambiar entre las dos pestañas, y
   mostrar "Generación de dieta" con su versión activa marcada `v1`.
2. **7.3** — Edita el texto y pulsa **Guardar**. Debe aparecer "Guardado como
   versión nueva. No está activa todavía", y la insignia de versión activa debe
   seguir en `v1`. Recarga: el histórico tiene `v2` y la activa sigue siendo
   `v1`. Pulsa **Activar** en la `v2` y recarga: ahora la activa es `v2`.
3. **7.4** — En el histórico, **Ver cambios** de la `v2` enseña el diff contra
   la `v1`. **Restaurar** la `v1` carga su texto en el editor sin tocar nada;
   al guardar aparece una `v3` y el histórico mantiene `v1` y `v2` intactas.
4. **7.5** — No aplica tal cual: ningún listado del Cerebro usa TanStack Table
   (son listas de botones), así que no hay `data`/`columns` que memoizar. Lo que
   sí conviene mirar es que la pestaña no se congela al abrir ni al filtrar.
5. **8.1** — Pestaña Documentación: suelta un `.pdf` en la zona de arrastre.
   Debe salir "Sube el documento en formato Markdown (.md)." y **no** debe
   haber ninguna petición en la pestaña de red. Repite con un `.md`: se lee y
   rellena el título.
6. **8.2** — Sube un `.md` con tipo y etiquetas. Aparece en el listado con su
   metadata y responde a los filtros de tipo y etiqueta.
7. **8.3** — Sobre ese documento, el mismo ciclo que en 7.3 y 7.4.
8. **8.4** — Marca documentos como "incluir en todas las generaciones" hasta
   pasar de 120.000 caracteres (el umbral de `ALWAYS_INCLUDED_SIZE_WARNING_CHARS`,
   fijado sobre los 181.660 del vault). Debe salir el aviso ámbar y la acción
   completarse igual.
9. ~~**10.1**~~ **hecho el 2026-11-14** — Genera una dieta en `/diets` sin haber tocado nada del Cerebro. El
   documento debe salir equivalente al de siempre y su vista previa reconocerse
   como estructurada (no en modo crudo).
10. **10.2** — Activa una versión nueva del prompt con un cambio visible (por
    ejemplo, pedir una línea más en Observaciones), genera otra dieta **sin
    redesplegar** y comprueba que el cambio aparece.
11. **10.3** — Con la tabla de documentos vacía, genera: debe funcionar. Luego
    fuerza un fallo (renombra temporalmente la tabla, o corta la red a Supabase
    tras el login) y comprueba que la consulta termina con su dieta guardada y
    que en el log del servidor sale `Generating with the code defaults:`.
12. **6.5 / 10.4** — En la consola del servidor, cada generación imprime
    `Diet generation usage:` con `cacheReadInputTokens`. En dos generaciones
    consecutivas sin tocar el Cerebro, la segunda debe traer un valor alto. Tras
    activar una versión, la primera generación posterior debe traer
    `cacheReadInputTokens: 0` y `cacheCreationInputTokens` alto; la siguiente,
    otra vez cache-hit. Anota también el tiempo total frente a los 59,6 s del
    peor caso conocido, que es lo que dice cuánto margen come el retrieval.
