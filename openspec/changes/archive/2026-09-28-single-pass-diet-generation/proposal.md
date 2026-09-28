# Proposal

## Why

El núcleo de generación funciona hoy como un pipeline: `gpt-4o` extrae campos a JSON con esquema fijo y otra llamada rellena `DIET_TEMPLATE`, una plantilla con `{{placeholders}}` de 240 líneas dentro de `extraction-service.ts`. Eso es exactamente lo que la dirección del proyecto descarta: el núcleo debe comportarse como un "Proyecto" de ChatGPT/Claude, una sola pasada con ejemplos reales en contexto.

El coste de la forma actual no es teórico. La plantilla impone de antemano qué secciones existen y en qué orden, así que una consulta que no encaja se deforma para caber. El tono y el formato que hacen reconocible una dieta de Vitalitty no están en ninguna parte del prompt: están en las dietas que la nutricionista ya ha escrito, y el modelo no las ve. Y el usuario espera delante de una pantalla quieta hasta que termina todo el pipeline, sin señal de progreso.

## What Changes

- **Una sola llamada de generación a Claude Opus** (`claude-opus-5`) sustituye al par extracción-a-JSON + relleno de plantilla como camino principal. Recibe en contexto: instrucciones con las reglas nutricionales, la dieta de ejemplo completa, el contexto del paciente con su dieta anterior si existe, y la transcripción cruda. Devuelve el documento en markdown, ya formateado.
- **Orden del prompt fijado para prompt caching.** El bloque estático (instrucciones + dieta de ejemplo) va primero y lleva un breakpoint `cache_control` explícito. El contexto del paciente va después y la transcripción al final, fuera del prefijo cacheado.
- **Streaming a pantalla.** La dieta aparece escribiéndose. El route handler emite el markdown conforme se genera; al cerrar el stream persiste la consulta con `diet_md`.
- **Revisiones editan, no regeneran.** Cuando el paciente ya tiene una dieta anterior, esta entra en contexto y las instrucciones piden editarla a partir de lo que dice la transcripción, no producir una nueva en frío.
- **La extracción de campos deja de ser el camino principal.** Pasa a una llamada aparte con Claude Haiku (`claude-haiku-4-5`), lanzada en paralelo, que no bloquea el render del documento. El markdown es la fuente de verdad; los campos estructurados son su proyección.
- **La dieta de ejemplo se congela como constante TypeScript.** Hoy existe como el PDF de una paciente real en `public/diets_example/` (no versionado: datos de salud). Leerla en runtime exigiría filesystem, prohibido en Vercel serverless, así que se convierte una vez a markdown y se guarda como módulo TS.
- **BREAKING (interno):** `generateDietMarkdown()` y `DIET_TEMPLATE` desaparecen de `extraction-service.ts`. `POST /api/process-consultation` cambia de respuesta JSON única a respuesta en streaming.
- **Nueva dependencia:** `@anthropic-ai/sdk`. Hoy el repo solo tiene `openai`.

Fuera de alcance: la transcripción sigue igual (`gpt-4o-transcribe`, cambio ya archivado). No se toca el calendario, el dashboard ni la autenticación.

### Divergencias respecto a lo pedido, decididas con el usuario

- Se pidieron **2-3 dietas reales** de ejemplo (de dos pacientes). Existe **una**, la de una paciente, y el usuario la aporta como base estructural. El cambio se diseña para admitir varias sin cambio de forma, pero arranca con una. Consecuencia registrada en design.md: con un solo ejemplar el modelo copia estructura con fiabilidad, pero tiene menos evidencia de qué varía legítimamente entre dietas.
- La persistencia ocurre **al cerrar el stream**, automática. La subida del `.md` a Storage sigue siendo el paso manual que ya existe, ahora servido por `POST /api/upload-diet`.

## Capabilities

### New Capabilities

- `diet-generation`: generación del documento de dieta en una sola pasada con ejemplos en contexto, su entrega en streaming, el modo edición sobre la dieta anterior y la persistencia al cerrar el stream.
- `consultation-extraction`: extracción de campos estructurados de la consulta para la base de datos, como proceso secundario que no bloquea la entrega del documento.

### Modified Capabilities

Ninguna. `audio-transcription` queda intacta: este cambio consume su salida sin alterar su contrato.

## Impact

Código afectado:

- `src/services/extraction-service.ts` — se parte. La generación sale a un servicio propio; la extracción se reescribe contra Haiku. `DIET_TEMPLATE` se elimina.
- `app/api/process-consultation/route.ts` — pasa a responder en streaming y a orquestar generación y extracción en paralelo.
- `app/diets/page.tsx` — consume el stream y pinta el markdown incrementalmente en vez de esperar un JSON.
- `app/actions/save-consultation.action.ts` — Server Action que duplica la lógica del route handler. Contradice la regla de transporte del proyecto y queda huérfana al cambiar el flujo; este cambio la retira.
- `app/actions/upload-diet.action.ts` — se porta a `app/api/upload-diet/route.ts` y se retira. La página ya hace `fetch("/api/upload-diet")`, pero esa ruta no existía: el botón de subida apuntaba a una ruta inexistente. Es una dependencia real de este flujo, no una migración oportunista, y dejarla fuera obligaría a archivar el cambio con la subida rota o llamando a una Server Action desde cliente. Mismo contrato que la página ya espera: cuerpo `{ consultationId, patientId, dietMd }`, respuesta `{ success, url?, error? }`. Con esto `app/actions/` queda vacío.
- Nuevo módulo de constantes con la dieta de ejemplo en markdown. Solo contenido: portada, logo, `@vitalittynutri` y pie de condiciones son presentación y los pone la plantilla del PDF (otro cambio), no el markdown.
- `public/diets_example/` — el PDF puede quedarse como referencia documental; deja de ser la fuente que lee el código.

Dependencias: se añade `@anthropic-ai/sdk`. `openai` permanece, solo para transcripción.

Base de datos: sin cambios de esquema en tablas. En Storage se crea el bucket privado `diets` con sus políticas (D12), que no existía. `patient_consultations.diet_md` y `documento_url` ya existen y se siguen usando igual.

Coste: el bloque estático se factura a 1.25× (TTL 5 min) o 2× (TTL 1 h) la primera vez y a ~0.1× en cada lectura posterior. La elección de TTL y su punto de equilibrio se deciden en design.md.
