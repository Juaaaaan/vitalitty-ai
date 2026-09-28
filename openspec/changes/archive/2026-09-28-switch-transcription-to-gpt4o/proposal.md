# Proposal

## Why

La transcripción de la consulta usa `whisper-1`, que comete errores en habla natural en español con acento, ruido de consulta y velocidad variable — justo donde más duele: nombres de alimentos y cantidades numéricas. Esos dos campos alimentan toda la extracción y la generación de dieta posteriores, así que un error de transcripción se propaga al plan nutricional. `gpt-4o-transcribe` tiene menor tasa de error en esas condiciones.

Además, hoy la llamada al modelo está duplicada: el route handler `/api/transcribe` tiene su propia llamada inline y no usa el servicio de transcripción. Cambiar el modelo en un solo sitio hoy no es posible.

## What Changes

- Cambiar el modelo de transcripción de `whisper-1` a `gpt-4o-transcribe`.
- Unificar la transcripción en un único punto: `/api/transcribe` pasa a delegar en `transcribeAudio()` en lugar de llamar a OpenAI en línea. El modelo queda definido en un solo lugar.
- Añadir validación del límite de 10 MB por request **antes** de llamar a OpenAI: request por encima del límite se rechaza con `413` y un mensaje accionable en español, en vez de fallar con el error crudo del proveedor.
- Eliminar `app/actions/transcribe.action.ts`: no lo importa nadie (el único consumidor real es `app/diets/page.tsx` vía `fetch`) y como Server Action contradice la regla dura del proyecto de que los client components llamen a route handlers.
- La firma pública del servicio no cambia: `transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult>`. El contrato de respuesta de `/api/transcribe` (`{ text }` / `{ error, text: "" }`) se mantiene, salvo el nuevo código de estado `413`.

Sin breaking changes para el cliente en el camino feliz.

## Capabilities

### New Capabilities

- `audio-transcription`: transcripción del audio de la consulta a texto — elección de modelo, idioma, determinismo, límite de tamaño de entrada y forma de los errores.

### Modified Capabilities

Ninguna. No existen specs previas en el proyecto.

## Impact

Código afectado:

- `src/services/trasncription-service.ts` — cambio de modelo, validación de tamaño.
- `app/api/transcribe/route.ts` — deja de llamar a OpenAI directamente; delega en el servicio y mapea el error de tamaño a `413`.
- `app/actions/transcribe.action.ts` — se elimina.
- `src/models/audio/transcription.model.ts` — posible ampliación del tipo de error (a decidir en design.md).

Sin cambios de dependencias: mismo cliente `openai`, mismo endpoint `audio.transcriptions.create`. Sin cambios de esquema en Supabase. Sin coste de migración de datos.

Riesgo principal: `gpt-4o-transcribe` no admite todos los `response_format` de `whisper-1` (no soporta `verbose_json` ni formatos de subtítulos). El código actual usa `response_format: "json"`, que sí está soportado — hay que verificarlo al implementar, no asumirlo.
