# Proposal

## Why

Hoy la app solo sabe hacer una cosa: grabar una consulta y producir la dieta. Todo lo demás — buscar un paciente, mirar cómo ha evolucionado, ver qué cambió entre dos dietas, saber a quién toca revisar esta semana, retocar una dieta sin volver a grabar — obliga a Jesús a navegar a mano entre la lista de pacientes, la ficha, la comparación y `/diets`, sabiendo de antemano dónde está cada cosa.

Es justo lo que un "Proyecto" de ChatGPT/Claude no puede dar y la app sí: preguntar en lenguaje natural sobre la base de datos real de pacientes. La pieza que falta no es más IA generativa, es un **agente acotado**: el modelo no ve SQL ni shell, solo llama a un catálogo cerrado de herramientas de dominio que ejecuta el backend.

Lo restringe la arquitectura objetivo: el markdown de la dieta sigue siendo la fuente de verdad (el agente lo lee y, como mucho, propone una versión nueva; nunca rellena plantillas desde JSON) y la regla dura 1 obliga a que todo pase por un route handler — que además es lo que mantiene la clave de Anthropic en el servidor.

## What Changes

- **Sección nueva `/asistente`**, separada del flujo audio → dieta. `/diets` no se toca.
- Conversación con **streaming**: texto del modelo, herramienta en curso y respuesta final llegan a pantalla conforme se producen. El hilo es efímero: vive en el cliente mientras la pestaña está abierta y se reenvía completo en cada petición. No se persiste ninguna conversación.
- Entrada por **chat y por voz**: el dictado reutiliza `POST /api/transcribe` tal cual y rellena el cuadro de texto, que Jesús puede corregir antes de enviar.
- **Bucle de tool-use de Anthropic dentro del route handler**: el modelo pide herramienta → el backend la ejecuta con el cliente Supabase de la sesión → le devuelve el resultado → repite hasta la respuesta final. El modelo nunca recibe SQL, shell ni acceso a ficheros, y toda consulta pasa por la RLS del usuario, así que no puede tocar pacientes ajenos.
- **Catálogo cerrado de herramientas de dominio**: `buscar_paciente`, `get_paciente`, `get_dietas`, `comparar_dietas`, `estadisticas_paciente`, `pacientes_por_criterio`, `generar_dieta`, `render_pdf`. Reutilizan los servicios existentes (contexto de paciente, comparación, evolución, generación, PDF); no se duplica lógica.
- **Regla de oro — lecturas libres, escrituras confirmadas**: las herramientas de lectura se ejecutan solas. `generar_dieta` y `render_pdf` no persisten nada por sí mismas: el agente **propone** la acción, la UI la muestra como propuesta con su resumen, y solo tras la confirmación explícita de Jesús el backend la ejecuta. Un rechazo vuelve a la conversación sin escribir nada.
- `generar_dieta` confirmada **crea una versión nueva de dieta** del paciente (consulta nueva sin audio, `diet_version` N+1 por trigger), partiendo de la última dieta y de la memoria del paciente. No sobrescribe la dieta vigente.
- **Agenda real**: se sustituye el mock de `calendar-service` por una tabla `appointments` en Supabase con RLS por usuario. Es lo que hace posible `pacientes_por_criterio` ("revisiones de esta semana") con datos de verdad, y de paso el calendario deja de mostrar datos inventados. **BREAKING** para `/dashboard/calendar`: la página pasa a mostrar la agenda real, que arranca vacía.

## Capabilities

### New Capabilities

- `assistant-agent`: la sección Asistente y su bucle acotado de herramientas — conversación con streaming, entrada por chat y voz, ejecución de herramientas de dominio, y la regla de lecturas libres / escrituras confirmadas, incluidos los límites de iteraciones y el tratamiento de errores.
- `assistant-tools`: el catálogo cerrado de herramientas de dominio: qué hace cada una, qué recibe, qué devuelve, cuáles leen y cuáles proponen una escritura.
- `appointments`: la agenda de citas como dato real por usuario — crear, consultar por mes y consultar por criterio (p. ej. revisiones de un rango de fechas), con el calendario leyendo de ahí.

### Modified Capabilities

- `diet-generation`: el motor de generación pasa a aceptar, además de la transcripción de una consulta, una **instrucción en lenguaje natural** como entrada de la pasada. El orden del prompt y el bloque estático cacheado no cambian.

## Impact

- **BD**: migración nueva con la tabla `appointments` (`patient_id` nullable, `start_time`, `end_time`, `type`, `status`, `notes`, `created_by`) y RLS `created_by = auth.uid()`, igual que `patients` y `patient_consultations`. Ninguna tabla existente cambia de esquema.
- **Rutas**: `app/api/assistant/route.ts` (bucle de tool-use, streaming NDJSON) y `app/api/assistant/confirm/route.ts` (ejecutar una acción propuesta ya confirmada). El cliente las llama con `fetch` (regla 1).
- **Servicios**: `src/services/assistant-*` para el catálogo, la ejecución y el bucle; `calendar-service.ts` pasa de mock a consultas Supabase; `diet-generation-service.ts` gana el modo "instrucción". Se reutilizan `patient-context-service`, `diet-comparison-service`, `patient-evolution-service` y `diet-pdf-service` sin duplicar su lógica.
- **UI**: `app/asistente/page.tsx` y componentes nuevos en `src/components/assistant/`. Si alguna vista usa TanStack Table, aplica la regla 3 (`data`/`columns` con referencia estable). Enlace nuevo en la barra lateral.
- **Storage**: el bucket privado `diets` no cambia. `render_pdf` reutiliza `POST /api/diet-pdf`, que sigue firmando la URL bajo demanda; nunca `getPublicUrl()`, son datos de salud.
- **Modelo**: llamadas nuevas al modelo de Anthropic para el bucle del agente, con el mismo cliente compartido `lib/ai/anthropic.ts`. La generación de dieta sigue usando el modelo de generación; el agente en sí no lo es.
- **Reglas duras**: regla 1 (solo route handlers, nada de Server Actions) y regla 2 (definiciones de herramientas y prompts como constantes TypeScript, sin filesystem). `maxDuration` de las rutas del agente a vigilar: el bucle encadena varias llamadas y `generar_dieta` ya roza los 60 s por sí sola.
