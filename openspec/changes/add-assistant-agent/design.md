# Design

## Context

Motivación y alcance: ver `proposal.md`. Requisitos: ver los deltas en `specs/`.

Lo que condiciona el enfoque:

- **Regla dura 1**: el cliente solo llega al servidor por route handlers. El bucle de tool-use vive entero en el servidor; el navegador nunca ve la clave de Anthropic ni las definiciones de herramientas.
- **Regla dura 2**: Vercel serverless, sin filesystem. Definiciones de herramientas y prompt del agente son constantes TypeScript.
- **`maxDuration`**: 60 s es el suelo seguro en todos los planes. Ya hay un problema abierto — una generación de dieta con memoria medida en **59,6 s** — y el agente encadena varias llamadas al modelo. Esto es lo que más condiciona el diseño.
- **RLS**: `patients` y `patient_consultations` filtran por `created_by = auth.uid()`. El cliente Supabase de la sesión (`lib/supabase/server.ts`) es la frontera de seguridad real: una herramienta que lo use no puede leer pacientes ajenos aunque el modelo invente un id.
- **Piezas reutilizables ya existentes**: `patient-context-service` (ficha + resúmenes), `diet-comparison-service` + `diet_changes`/`diet_portions` (comparación cacheada), `patient-evolution-service` (evolución), `diet-generation-service` (pasada única con bloque cacheado), `diet-pdf-service` + `/api/diet-pdf` (PDF como caché del markdown).
- **El calendario es mock**: `calendar-service.ts` devuelve `MOCK_APPOINTMENTS` y no existe tabla de citas. Sin agenda real no hay "revisiones de esta semana".

## Goals / Non-Goals

**Goals:**

- Un bucle de tool-use con un catálogo cerrado, ejecutado en servidor, que responda en streaming y no pueda salirse de los datos del usuario.
- Reutilizar los servicios existentes como implementación de las herramientas, sin duplicar lógica ni recalcular lo ya cacheado.
- Que ninguna escritura ocurra sin una confirmación explícita verificada en servidor.

**Non-Goals:**

- No se persiste la conversación ni se construye historial de hilos.
- No se toca `/diets` ni el flujo audio → dieta → preview → aprobar.
- No se añade UI de gestión de agenda (crear/editar citas a mano). Esta fase crea la tabla, la lee y permite sembrarla; la edición visual queda para otro cambio.
- El agente no edita código ni ejecuta comandos: es un agente de dominio.

## Decisions

### D1. Bucle de tool-use en el route handler, no en el cliente

El bucle `modelo → tool_use → ejecutar → tool_result → modelo` corre dentro de `POST /api/assistant`, que recibe el hilo completo y devuelve NDJSON con eventos `text`, `tool_start`, `tool_end`, `proposal`, `error`, `done` — el mismo formato de eventos por línea que ya usa `/api/process-consultation`, para reutilizar el patrón de lectura en el cliente.

_Alternativa descartada_: devolver al cliente los `tool_use` y que él llame a rutas por herramienta. Multiplica los viajes, obliga a exponer el catálogo al navegador y deja la decisión de qué ejecutar en manos del cliente, que es exactamente lo que la regla de escrituras confirmadas quiere impedir.

### D2. El hilo es efímero y viaja en cada petición

El cliente guarda los mensajes en estado de React y los reenvía completos. Sin tablas, sin migración, sin datos de salud persistidos de más.

_Alternativa descartada_: `assistant_conversations` + `assistant_messages` en Supabase. Añade esquema, RLS y UI de listado para un beneficio que hoy nadie ha pedido, y persiste texto clínico libre que ahora mismo no existe en ninguna parte.

### D3. El catálogo se declara una vez y se ejecuta por un despachador con clasificación read/write

Un módulo `src/services/assistant/tools.ts` exporta, por herramienta, su definición para el modelo (nombre, descripción, `input_schema`) **y** su clasificación `read` | `write`, junto a un ejecutor. El despachador es quien decide: `read` → ejecutar y devolver `tool_result`; `write` → **no ejecutar**, emitir un evento `proposal` y cerrar la vuelta.

Que la clasificación viva pegada a la definición, y no en una lista aparte, es deliberado: una lista paralela se desincroniza en cuanto alguien añade una herramienta, y el fallo sería que una escritura se ejecute sola.

_Alternativa descartada_: pedir la confirmación al modelo por prompt ("pregunta antes de escribir"). Es una instrucción, no una garantía: un modelo puede saltársela. La regla de oro tiene que ser estructural.

### D4. Las escrituras se confirman en una ruta aparte, que revalida todo

`POST /api/assistant/confirm` recibe `{ action, args }`, y **vuelve a validar**: que la acción es una herramienta de escritura conocida, que sus argumentos son válidos y que el paciente es del usuario (vía RLS). No se fía de nada que venga del cliente, ni de un "ya estaba propuesto".

_Alternativa descartada_: guardar la propuesta en servidor con un id y confirmar por id. Necesita almacenamiento con expiración (tabla o KV) para un flujo que dura segundos. Revalidar los argumentos da la misma garantía sin estado.

_Consecuencia aceptada_: el cliente podría confirmar unos argumentos distintos de los propuestos. No es una escalada de privilegios — puede hacer exactamente lo mismo desde `/diets` — y la revalidación garantiza que siga siendo una acción legítima sobre un paciente suyo.

### D5. Presupuesto de tiempo: el bucle no genera dietas, solo las propone

`maxDuration = 60` con un bucle que llama al modelo varias veces es un riesgo real. Se reparte así:

- `POST /api/assistant`: `maxDuration = 60`, tope de **8 iteraciones** de herramienta por vuelta. Las herramientas de lectura son consultas a Supabase (decenas de ms) salvo `comparar_dietas` cuando la comparación no está cacheada, que llama al modelo de extracción.
- `POST /api/assistant/confirm`: `maxDuration = 60` propio, y es **el único sitio donde se genera una dieta o se renderiza un PDF**. Así la generación no comparte presupuesto con el bucle: paga sus ~50 s sola, igual que hoy en `/api/process-consultation`.

Esta es la razón técnica —además de la regla de oro— por la que `generar_dieta` y `render_pdf` no se ejecutan dentro del bucle.

_Alternativa descartada_: ejecutar la generación dentro del bucle y confirmar después. Sumaría la generación al tiempo del bucle y, encima, gastaría una generación completa que el usuario puede rechazar.

### D6. Modelo del agente y corte de caché

El agente usa el modelo de extracción/razonamiento rápido (Haiku), no el de generación: su trabajo es elegir herramientas y redactar respuestas cortas sobre datos ya estructurados. La generación de dieta sigue siendo del modelo de generación, dentro de la ruta de confirmación.

El prompt del agente se ordena `[system estático: rol + catálogo + reglas]` → `[hilo de la conversación]`, y el corte de caché va **al final del system**. Es el mismo criterio que la generación: lo invariable primero y es lo único cacheable; el hilo cambia en cada vuelta, así que meterlo dentro del bloque estático invalidaría el prefijo siempre. Con el system por debajo del prefijo mínimo cacheable de Haiku el `cache_control` no rinde, igual que ya pasa en `diet-comparison-service`; el orden se mantiene porque es el único en el que la caché _puede_ servir.

### D7. Las herramientas reutilizan servicios, no rutas

Las herramientas llaman a los servicios (`patient-context-service`, `diet-comparison-service`, `patient-evolution-service`, `diet-pdf-service`) directamente, no por `fetch` a las rutas existentes. Una llamada HTTP del servidor a sí mismo añade latencia, re-autenticación y un salto que puede fallar solo.

Donde hoy la lógica vive en el route handler y no en un servicio —el cacheado de `diet_changes` en `/api/compare-diets`, el hash y la subida del PDF en `/api/diet-pdf`— se **extrae a un servicio** y el route handler pasa a llamarlo. Es refactor sin cambio de comportamiento: la ruta sigue respondiendo igual.

_Alternativa descartada_: duplicar el cacheado en la herramienta. Dos sitios que deciden cuándo recalcular una comparación acaban discrepando.

### D8. Agenda: tabla `appointments` con el modelo que la UI ya espera

La migración crea `appointments` con exactamente los campos del tipo `Appointment` que el calendario ya consume (`patient_id` nullable, `start_time`, `end_time`, `type`, `status`, `notes`, `created_by`), con RLS `created_by = auth.uid()` e índice por `(created_by, start_time)`. `calendar-service.ts` sustituye el mock por consultas; la firma de `getAppointmentsForMonth` y `getWeeklySummary` no cambia, así que la página y su test siguen igual.

Los rangos se calculan en la zona horaria local del usuario y se envían como instantes; la columna es `timestamptz`.

_Alternativa descartada_: deducir "revisión esta semana" del `proxima_revision` del frontmatter de la última dieta. Evita la migración, pero convierte un campo de texto de un documento en la agenda de la consulta: sin estado, sin hora, sin distinguir tipos de cita y sin poder cancelar nada.

_Consecuencia aceptada_ (**BREAKING**): el calendario arranca vacío. Los datos que mostraba eran inventados, no había nada real que perder.

### D9. La voz reutiliza `/api/transcribe` tal cual

El botón de dictar graba con el mismo componente de audio y llama a la ruta existente; el texto cae en el cuadro de entrada, no se envía solo. Sin cambios en transcripción: la regla de los 10 MB y el modelo siguen donde están.

_Alternativa descartada_: enviar la transcripción directa al agente. Una palabra mal transcrita dispararía una vuelta entera del agente sin que el usuario pueda corregirla.

## Risks / Trade-offs

- **El bucle se pasa de 60 s** → Tope de 8 iteraciones, herramientas de lectura solo contra Supabase, y la generación y el PDF fuera del bucle (D5). Medir en Vercel, no solo en local: el problema ya conocido de `maxDuration` sigue abierto.
- **El modelo elige mal el paciente entre homónimos** → `buscar_paciente` devuelve correo y teléfono y el spec obliga a preguntar en vez de adivinar; es el mismo criterio que ya aplica el selector de `/diets`.
- **El modelo se inventa datos que ninguna herramienta devolvió** → El system prohíbe responder de memoria y obliga a citar de dónde sale cada dato; una lista vacía se comunica como vacía. Es mitigación por prompt, así que se cubre con pruebas de la respuesta a resultados vacíos.
- **Una herramienta devuelve demasiado texto y revienta el contexto** → `get_dietas` devuelve el documento completo solo de pocas versiones y metadatos del resto; `get_paciente` nunca devuelve documentos de dieta.
- **`comparar_dietas` sin caché llama al modelo dentro del bucle** → Es la única lectura cara. Se ejecuta sobre pares consecutivos, se guarda en `diet_changes` y la segunda vez es gratis; si tarda, el evento `tool_start` ya está en pantalla.
- **Coste**: cada vuelta reenvía el hilo entero. Con un agente Haiku y hilos cortos es asumible; si crece, el siguiente paso es recortar el hilo, no persistirlo.
- **Refactor de `/api/compare-diets` y `/api/diet-pdf` a servicios (D7)** → Riesgo de regresión en dos rutas que funcionan. Se hace como extracción sin cambio de comportamiento y con los tests existentes como red.

## Migration Plan

1. Migración `appointments` (tabla + RLS + índice). No toca ninguna tabla existente, así que es reversible con un `drop table`.
2. `calendar-service.ts` pasa a Supabase. Tras desplegar, el calendario queda vacío hasta sembrar citas: avisar antes de desplegar.
3. Extracción a servicios de la lógica de comparación y de PDF, con las rutas existentes llamándolos. Verificable con los tests actuales.
4. Rutas y UI del asistente. Hasta que el enlace exista en la barra lateral, la sección no es alcanzable: el resto de la app no se ve afectada en ningún punto intermedio.

Rollback: retirar el enlace del asistente deja la app exactamente como antes salvo el calendario, que requiere revertir el punto 2.

## Open Questions

- Cómo se siembran las primeras citas mientras no haya UI de agenda (script puntual en `scripts/` o inserción manual). No condiciona ni los specs ni el reparto de tareas.
- Si `pacientes_por_criterio` debe acabar aceptando criterios compuestos. El spec fija un conjunto acotado y ampliarlo es añadir un criterio, no rehacer el diseño.
