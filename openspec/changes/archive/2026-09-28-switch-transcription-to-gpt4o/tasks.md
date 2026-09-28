# Tasks

## 1. Servicio de transcripción como fuente de verdad

- [x] 1.1 Verificar contra la API real que `gpt-4o-transcribe` acepta `language: "es"`, `temperature: 0` y `response_format: "json"`: ejecutar una llamada de prueba con un audio corto y comprobar que devuelve `200` con `text` poblado. Si algún parámetro es rechazado, anotar cuál y retirarlo antes de continuar (D6 de design.md)
- [x] 1.2 Añadir en `src/services/trasncription-service.ts` la constante del límite de tamaño (`MAX_AUDIO_BYTES = 10 * 1024 * 1024`) exportada, y verificar que se importa sin errores de tipos con `npx tsc --noEmit`
- [x] 1.3 Ampliar `TranscriptionResult` en `src/models/audio/transcription.model.ts` con `errorCode?: "FILE_TOO_LARGE"` (aditivo, opcional) y verificar con `npx tsc --noEmit` que ningún consumidor existente rompe
- [x] 1.4 En `transcribeAudio()`, rechazar `audioBlob.size > MAX_AUDIO_BYTES` antes de construir el `File`, devolviendo `{ text: "", error: <mensaje en español>, errorCode: "FILE_TOO_LARGE" }`; verificar con un test unitario que con un blob por encima del límite el cliente OpenAI no se invoca (mock) y que con uno de exactamente `MAX_AUDIO_BYTES` sí se invoca
- [x] 1.5 Cambiar el modelo de `whisper-1` a `gpt-4o-transcribe` en `transcribeAudio()` y verificar con un test unitario que el parámetro `model` enviado al cliente OpenAI es `"gpt-4o-transcribe"`
- [x] 1.6 Retirar el `console.log({ transcription })` del camino de éxito y dejar el registro solo en el camino de error; verificar leyendo el fichero que no queda ningún log del cuerpo de la transcripción

## 2. Route handler delegando en el servicio

- [x] 2.1 Reescribir `app/api/transcribe/route.ts` para que llame a `transcribeAudio()` en lugar de a `openai.audio.transcriptions.create`; verificar con `grep -r "audio.transcriptions.create" src app lib` que solo queda una ocurrencia, en el servicio
- [x] 2.2 Mapear en el route handler `errorCode === "FILE_TOO_LARGE"` a HTTP `413`, el resto de errores a `500` y el éxito a `200`, manteniendo siempre `error` en el cuerpo JSON; verificar con tests de ruta los tres casos (éxito, audio grande, fallo del proveedor) comprobando status y cuerpo
- [x] 2.3 Conservar el `400` actual cuando no se adjunta audio y verificar con un test que no se llama al servicio en ese caso

## 3. Retirada de la Server Action muerta

- [x] 3.1 Confirmar que `app/actions/transcribe.action.ts` no tiene consumidores: `grep -rn "transcribe.action\|transcribeAction" src app lib` debe devolver solo el propio fichero
- [x] 3.2 Eliminar `app/actions/transcribe.action.ts` y verificar que `npm run build` completa sin errores de import

## 4. Verificación de integración

- [x] 4.1 Ejecutar `npm run test` y `npm run lint` y verificar que ambos pasan sin errores nuevos
- [x] 4.2 Adoptar `gpt-4o-transcribe` sin prueba comparativa A/B contra `whisper-1`. Decisión explícita del usuario (2026-09-28): se da por bueno el menor WER del modelo en acentos, ruido y velocidad variable sin verificación empírica previa. El criterio de aceptación original (comparar fidelidad en nombres de alimentos y números sobre el mismo audio) queda **renunciado, no cumplido** — ver design.md, D7
- [x] 4.3 Fijar `MAX_AUDIO_BYTES` en 10 MB como valor definitivo, sin medir el tope real de body del entorno desplegado. Decisión explícita del usuario (2026-09-28): 10 MB se considera suficiente para una consulta. Riesgo residual anotado en design.md, D7
- [x] 4.4 Verificado por el usuario en el navegador (2026-09-28): `/diets` transcribe con `gpt-4o-transcribe` y genera la dieta de extremo a extremo. `app/diets/page.tsx` intacto (`git diff` vacío), así que el cambio de servidor no rompió la pantalla. **Camino de error no ejercitado**: no se provocó un fallo real de transcripción ni un audio por encima de 10 MB contra la UI; ese comportamiento solo está cubierto por tests (413/500) — ver design.md, D7
