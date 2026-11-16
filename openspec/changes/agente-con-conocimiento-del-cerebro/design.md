# Design

## Context

El bucle del asistente corre hoy en `POST /api/assistant` con `maxDuration = 60`, el modelo de extracción, 2.048 tokens de respuesta y 8 herramientas encadenadas por vuelta. Medido en navegador (local, 2026-09-29): una vuelta con una herramienta 3,3 s, con tres 7,6 s, y una cuyo `comparar_dietas` no estaba cacheado **~35 s**. Ese 35 contra 60 es el margen real del que se parte.

El conocimiento ya está en Postgres, versionado, con una versión activa por documento, y ya hay una pieza que lo lee para la generación: `loadBrainContext()` en `brain-retrieval-service.ts`, con selección por etiquetas contra la ficha del paciente y un presupuesto de 3 s, que **nunca lanza**.

La forma del corpus, medida sobre el `vault/` que está cargado:

| documento                                              | bytes       | secciones `##` | bytes/sección |
| ------------------------------------------------------ | ----------- | -------------- | ------------- |
| `COMPENDIO_PUBMED`                                     | 51.783      | 37             | 1.400         |
| `PROTOCOLO_MAESTRO_PROMPTS_EDITOR_v2`                  | 40.550      | 43             | 943           |
| `VITALITTY_Recetario_Maestro_141_Platos`               | 32.233      | 14             | 2.302         |
| `Biblioteca_Maestra_Suplementacion_v1`                 | 22.462      | 24             | 936           |
| `Fuentes_cientificas_..._Hipertrofia_Microbiota_Mujer` | 22.336      | 29             | 770           |
| `VITALITTY_Ampliacion_Banco_Maestro_50_Platos`         | 11.814      | **2**          | **5.907**     |
| **total**                                              | **181.178** | **149**        |               |

Dos cifras mandan en el diseño: **181 KB ≈ 45k tokens** si se inyecta entero, y **149 encabezados ≈ 1,5k tokens** si se inyecta solo el índice. Y una excepción: un documento con 2 secciones de ~6 KB, que es el que rompe cualquier supuesto de "una sección es pequeña".

## Goals / Non-Goals

**Goals:**

- Que el asistente pueda responder preguntas de criterio apoyándose en el material de la nutricionista.
- Que distinga lo que es dato de lo que es criterio, y lo diga.
- Que diga de dónde sale cada cosa, de forma comprobable.
- Que nada de esto pueda tumbar una vuelta ni tocar el Cerebro.

**Non-Goals:**

- No se cambia la generación de dietas, ni `loadBrainContext()`, ni la selección por etiquetas, ni el vocabulario de `brain-tag-vocabulary.ts`.
- No se añade ninguna herramienta de escritura, ni sobre el Cerebro ni sobre nada.
- No se persiste el hilo: sigue viviendo en estado de React y reenviándose entero.
- No se toca `/cerebro`. Eso es el otro cambio.
- No se añade búsqueda semántica ni embeddings.

## Decisions

### El bucle pasa a Sonnet

`ASSISTANT_MODEL` deja de ser el modelo de extracción y pasa a Sonnet (`claude-sonnet-5-5`; el identificador exacto se confirma contra la API antes de fijarlo). La elección de modelo es decisión de diseño, no requisito: en los specs no aparece.

- **Descartado: quedarse en el modelo de extracción y arreglar solo el prompt.** El prompt es parte del problema, pero no todo: el modelo que proyecta raciones y compara dietas está dimensionado para elegir herramientas y recitar resultados. Razonar sobre material clínico y decidir qué fragmento pedir es otra tarea.
- **Descartado: el modelo de generación (Opus).** Es el que escribe la dieta, en una pasada por consulta. Una herramienta conversacional con varias vueltas por minuto no justifica ese coste por turno, y la latencia haría el chat incómodo.

### Índice en el bloque de sistema, contenido por herramienta

El asistente recibe en su bloque de sistema un índice del conocimiento activo: por documento, título, tipo, etiquetas y la lista de sus encabezados. El contenido se obtiene después con las dos herramientas de lectura.

- **Descartado: inyectar el Cerebro entero.** 45k tokens en cada vuelta. Se pagaría lectura de caché de 45k por pregunta, y un modelo razonando sobre 45k de contexto para contestar "¿cuánta creatina?" rinde peor que sobre el fragmento que importa.
- **Descartado: solo herramientas, sin índice.** Un modelo no pide lo que no sabe que existe, y el prompt actual le dice que lo que no cubra una herramienta no lo sabe. Sin índice, la herramienta de búsqueda se usaría a ciegas o no se usaría.

1,5k frente a 45k: **treinta veces menos**, y el modelo sigue sabiendo qué hay.

### Dónde cae el corte de caché

El bloque de sistema va primero y es lo único con corte de caché. Dentro de él, el orden es:

```
[ rol + reglas (dato/criterio, procedencia) ]   ← no varía nunca
[ índice del conocimiento activo del usuario ]  ← varía al editar o activar un documento
─────────── corte de caché ───────────
[ hilo de la conversación, en messages ]
[ encabezado del turno: fecha de hoy y semana ]
```

Es el mismo criterio que la generación. El índice depende del usuario, así que el prefijo es por usuario; y activar o editar un documento lo invalida **a propósito**: la primera vuelta tras un cambio en el Cerebro paga frío y el resto da en caché. La fecha de hoy sigue viajando en el mensaje, no en el bloque, porque metiéndola arriba se invalidaría el prefijo cada día.

### Las secciones son los encabezados del propio documento

Un fragmento se identifica por documento + encabezado `##`. Nada de trocear por tamaño fijo.

- **Descartado: chunks de N caracteres.** Parten frases por la mitad y, sobre todo, la procedencia deja de ser comprobable: "fragmento 7 de 42" no es algo que la nutricionista pueda ir a mirar; "Biblioteca de Suplementación · Creatina" sí. La exigencia de citar la fuente es la que fija la unidad.
- **Caso degradado**: un documento sin encabezados `##` se trata como una sola sección con el título del documento. Y uno con secciones enormes —el `Ampliacion_Banco_Maestro` tiene dos de ~6 KB— se recorta por tamaño al devolverlo, no se devuelve entero.

### La búsqueda se hace en Node sobre las versiones activas

El ejecutor lee las versiones activas de los documentos del usuario con el cliente Supabase de la sesión y busca en memoria, normalizando a minúsculas y sin acentos —el material está en español, y "suplementación" no debe fallar contra "suplementacion".

- **Descartado: `tsvector` + índice GIN.** Una migración, una columna derivada y un disparador que mantenerla, para 181 KB y seis documentos que caben de sobra en memoria. Si el corpus crece un orden de magnitud, se revisa; hoy sería infraestructura para un problema que no existe.
- **Descartado: embeddings y búsqueda vectorial.** Migración, modelo de embeddings, coste por documento y reindexación en cada activación. Y la búsqueda literal sobre vocabulario clínico —nombres de nutrientes, de suplementos, de platos— acierta bastante: es vocabulario cerrado, no lenguaje abierto.
- **Que se lee de Postgres y nunca del `vault/`** es regla dura 2, pero también evita una divergencia: el repo tiene una copia del material y la base de datos tiene la versión activa, que puede ser otra.

### Topes de lo que la herramienta devuelve

La búsqueda acota cuántos fragmentos devuelve y cuánto mide cada uno, y un fragmento es la sección **recortada alrededor de la coincidencia**, no la sección entera. Los números se fijan midiendo contra el corpus real, igual que el `SEARCH_LIMIT = 10` y el `FULL_DOCUMENT_LIMIT = 2` que ya existen en el catálogo.

- **Descartado: devolver la sección entera siempre.** Con 1 KB de media parecería inofensivo, hasta el documento de secciones de 6 KB: tres resultados y la vuelta arrastra 18 KB.

### Leer sin sección devuelve el índice del documento, no su contenido

Así el modelo puede acercarse en dos pasos sin traerse 50 KB a la conversación por equivocarse de sección. Y una sección inexistente devuelve error **con las secciones disponibles**, para que corrija en la misma vuelta en lugar de gastar otra.

### Servicio aparte, sin tocar la generación

Las tres operaciones —índice, búsqueda, lectura de sección— van en un servicio hermano (`brain-knowledge-service.ts` o equivalente), no dentro de `loadBrainContext()`.

- **Descartado: reutilizar `loadBrainContext()`.** Está dimensionada para la generación: selecciona por etiquetas contra la ficha del paciente, devuelve contenidos enteros y tiene un presupuesto de 3 s. El asistente necesita lo contrario —buscar por texto, devolver trozos—, y retocarla pondría en riesgo la ruta que no puede romperse. Lo que sí se reutiliza es su criterio: no lanzar nunca y degradar con aviso en el log.

### Los techos de la vuelta

|                                   | hoy   | queda |
| --------------------------------- | ----- | ----- |
| herramientas encadenadas          | 8     | 12    |
| tokens de respuesta               | 2.048 | 4.096 |
| `maxDuration` de `/api/assistant` | 60    | 180   |

- **Descartado: quitar el tope de herramientas.** Es lo que impide una vuelta que no termina; sigue haciendo falta. Lo que no cabe en 8 son dos o tres lecturas de conocimiento **encima** de las de paciente.
- **Descartado: 8.192 tokens de respuesta.** Una respuesta de chat de ese tamaño no se lee. Si hace falta más, la pregunta había que partirla.

### Restricción de Vercel que condiciona el enfoque

- **`maxDuration = 180` exige plan por encima de Hobby**, que corta en 60 y rechaza un valor mayor al desplegar. Ya es el caso de las dos rutas que generan, así que no añade un requisito nuevo al proyecto; sí lo añade a esta ruta.
- **Sin filesystem** (regla dura 2): el conocimiento se lee de Postgres. El `vault/` del repo no se abre en runtime, ni para buscar.
- **Tamaño de body**: el hilo se reenvía entero en cada petición y ahora las respuestas serán más largas, así que el hilo crece más rápido. No es un problema a corto plazo, pero es la razón por la que no se mete el conocimiento recuperado dentro del hilo más de lo necesario.

### El prompt: la separación dato/criterio, escrita

El bloque de sistema se reescribe alrededor de esta tabla, que es lo que de verdad significa "que no sea estricto":

```
DATO      peso · kcal · raciones · versión · cita · nombre
          → sale de una herramienta o no se dice. Igual de estricto que hoy.

CRITERIO  qué suplementar · cómo repartir tomas · por qué esta pauta
          → se razona sobre el conocimiento recuperado, citando documento y sección.
            Si no hay material que lo cubra, se dice y se separa del criterio propio.
```

Se mantienen tal cual las reglas que no estorban: nada de URLs, nada de macros en gramos, español, breve. Se quita la que convertía cualquier pregunta sin herramienta en una negativa.

- **Descartado: aflojar las reglas en bloque.** Son datos de salud. Un peso inventado o una dieta atribuida al paciente equivocado es daño, no un fallo de estilo. Lo que se suelta es el criterio, y solo porque ahora hay material propio sobre el que razonar y la obligación de citarlo.

## Risks / Trade-offs

- **El riesgo central: soltar el criterio y que empiece a inventar datos.** La separación está en el spec y no solo en el prompt, y los datos siguen saliendo exclusivamente de herramientas, pero el cumplimiento de una regla de prompt no se demuestra con un test unitario. Hay que verificarlo con preguntas reales en navegador, incluidas las que invitan a inventar ("¿cuánto pesa?" sin haber consultado).
- **Puede citar bien y razonar mal.** Que la procedencia sea correcta no hace que la conclusión clínica lo sea. Eso es juicio de la nutricionista; el valor del cambio es que ahora puede comprobar de dónde sale cada afirmación, no que la afirmación sea buena. Es el mismo límite ya registrado para el Cerebro en la generación: que el conocimiento entre en contexto está demostrado; que mejore las dietas, no.
- **Coste por vuelta al alza por tres vías a la vez**: modelo más caro, 1,5k tokens de índice en cada prefijo y fragmentos en el hilo. Hay que medirlo, y el índice está cacheado justo para que la vía más barata sea la que se repite.
- **Latencia**: `maxDuration = 180` es un techo, no una espera. Una vuelta con dos lecturas de conocimiento hay que medirla en navegador; si se va a la treintena de segundos, el chat se hace incómodo mucho antes de agotar el presupuesto.
- **El tope de 12 herramientas puede quedarse corto** en una pregunta que toque tres pacientes y dos documentos. El mensaje de límite ya existe y pide concretar; si salta a menudo con preguntas razonables, el número está mal.
- **Un documento sin encabezados rompe la unidad de cita.** Se degrada a "documento completo" como sección única, que es honesto pero poco útil para comprobar; la salida es que la nutricionista secciones sus documentos, y eso no se le puede imponer desde aquí.
- **Divergencia `vault/` ↔ Postgres.** Probar contra los ficheros del repo y no encontrar lo que la búsqueda devuelve no es un fallo de la búsqueda: es que la versión activa en la base de datos es otra.
