# Proposal

## Why

El Cerebro tiene 181 KB de material clínico de la nutricionista cargado y versionado, y el asistente **no sabe que existe**: las ocho herramientas del catálogo leen pacientes, dietas, estadísticas y agenda, ninguna toca `documentos_conocimiento`. Su prompt, además, se lo prohíbe explícitamente — _"Solo sabes lo que te digan las herramientas. Si lo que te piden no lo cubre ninguna herramienta, dilo claramente"_ —, así que ante "¿cuánta creatina le pauto a esta paciente?" la respuesta correcta según sus propias reglas es negarse.

El resultado es un asistente que sabe recitar datos y no sabe ayudar. Lo que la nutricionista quiere preguntarle —por qué esta pauta y no otra, qué dice su propio material sobre un caso— es justo lo que tiene vetado.

A eso se suma el techo: el bucle corre con el modelo de extracción (`claude-haiku-4-5`, el mismo que proyecta raciones y compara dietas) con 2.048 tokens de respuesta y 8 herramientas encadenadas por vuelta. Está dimensionado para elegir herramientas y recitar resultados, no para razonar sobre material clínico.

## What Changes

- **El asistente puede consultar el conocimiento del Cerebro.** Dos herramientas de lectura nuevas: buscar en el conocimiento por texto, y leer una sección concreta de un documento. El catálogo sigue cerrado y sigue sin haber SQL, shell ni ficheros.
- **El asistente sabe qué conocimiento existe sin tener que adivinarlo.** Un índice de los documentos activos —título, tipo, etiquetas y sus secciones— entra en su bloque de sistema, porque un modelo no puede pedir lo que no sabe que está ahí.
- **Se separa el dato del criterio**, que es lo que de verdad significa "que no sea tan estricto":
  - **dato** (peso, kcal, versión, cita, nombre) sigue siendo intocable: sale de una herramienta o no se dice;
  - **criterio** (qué suplementar, cómo repartir tomas, por qué esta dieta y no otra) pasa a estar permitido, razonando sobre el conocimiento recuperado y **diciendo de qué documento sale**.
- **El asistente deja de negarse a lo que su material sí cubre.** Hoy "fuera del catálogo" y "no tengo herramienta para eso" se confunden; se distingue entre una _acción_ que no puede hacer y una _pregunta_ que el conocimiento sí responde.
- **Sube el modelo del bucle** del de extracción a Sonnet, y con él el techo de respuesta y el de herramientas encadenadas por vuelta.
- **Sube `maxDuration` de `POST /api/assistant`** de 60 a 180 s, como ya está en las dos rutas que generan. Con el modelo actual, una vuelta cuyo `comparar_dietas` no estaba cacheado medía ~35 s contra un techo de 60; añadir lecturas de conocimiento y un modelo más lento no cabe en ese margen.
- **Nada cambia en las escrituras.** `generar_dieta` y `render_pdf` siguen siendo propuestas que solo ejecuta `POST /api/assistant/confirm`, el bucle sigue importando solo `read-tools.ts`, y el conocimiento entra **solo como lectura**: ninguna herramienta nueva escribe, ni en el Cerebro ni en ningún sitio.

## Capabilities

### New Capabilities

- `assistant-knowledge`: cómo el asistente usa el conocimiento del Cerebro — qué sabe que existe antes de preguntar, la separación entre dato y criterio, de dónde dice que sale cada cosa, y qué hace cuando el Cerebro no responde.

### Modified Capabilities

- `assistant-tools`: el requisito "Catálogo cerrado y clasificado" enumera las herramientas de lectura; entran dos más. Y se añaden los contratos de esas dos: buscar en el conocimiento y leer una sección.
- `assistant-agent`: el requisito "El asistente solo actúa a través de herramientas de dominio" dice hoy que cuando lo pedido queda fuera del catálogo el asistente diga que no puede hacerlo. Se distingue entre una acción que no está en el catálogo y una pregunta de criterio que el conocimiento sí cubre; el dato de paciente sigue saliendo solo de una herramienta.

## Impact

**Código afectado:**

- `src/services/assistant/prompt.ts`: modelo, techo de respuesta, tope de herramientas por vuelta y reescritura del bloque de sistema con la separación dato/criterio. El índice del conocimiento se compone aquí, delante del hilo.
- `src/services/assistant/catalog.ts`: dos definiciones de herramienta nuevas, ambas `kind: "read"`. `catalog.test.ts` es la alarma de que ninguna escritura se cuele en el despachador de lecturas.
- `src/services/assistant/read-tools.ts`: sus ejecutores, con el cliente Supabase de la sesión, de modo que RLS —y no el prompt— es lo que acota el conocimiento al del propio usuario.
- `src/services/assistant/agent-loop.ts`: resolver el índice antes de la primera llamada al modelo.
- `app/api/assistant/route.ts`: `maxDuration` a 180.
- Posible función de lectura nueva en `src/services/brain-retrieval-service.ts` o un servicio hermano. Lo que **no** se toca es `loadBrainContext()`: la ruta de generación no debe cambiar de comportamiento por esto.

**Sin impacto**: ninguna migración —el conocimiento ya está en `documentos_conocimiento`/`documento_versiones`, y se lee, no se escribe—, ningún cambio en `/cerebro`, en la generación de dietas, en el contrato markdown ni en la plantilla del PDF. Nada en Storage: el asistente no toca el bucket privado `diets` por esta vía; el único documento que ya firmaba era el PDF de una dieta, por `render_pdf`, y eso no cambia.

**Reglas duras y arquitectura que lo enmarcan**: el cliente sigue hablando por `fetch` con `/api/assistant`, sin Server Actions (regla dura 1). El conocimiento se lee de Postgres, nunca del sistema de ficheros, aunque el `vault/` exista en el repo (regla dura 2). Y se mantiene el criterio de caché de la generación: lo que no varía entre vueltas va primero, en el bloque de sistema; el hilo y la fecha de hoy van después.

**Riesgo que gobierna el diseño**: son datos de salud y el material es clínico. Soltar el criterio sin soltar el dato es la línea entera de este cambio, y está en el spec, no solo en el prompt.
