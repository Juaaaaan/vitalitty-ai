# Design

## Context

Ver `proposal.md` — Why para la motivación.

Estado actual relevante:

```
app/diets/page.tsx:142
    └─ fetch("/api/transcribe", FormData)        ← ÚNICO consumidor real
          └─ app/api/transcribe/route.ts
                └─ openai.audio.transcriptions.create(...)   whisper-1  [inline]

src/services/trasncription-service.ts
    └─ transcribeAudio(Blob)
          └─ openai.audio.transcriptions.create(...)   whisper-1  [duplicado]
                ↑
          app/actions/transcribe.action.ts   ← no lo importa nadie
```

El cliente OpenAI compartido vive en `lib/ai/openai.ts` (raíz del repo, no bajo `src/`).

Restricciones que condicionan el diseño:

- Regla dura del proyecto: los client components llaman a route handlers, nunca a Server Actions.
- Vercel serverless: sin `readFileSync` ni dependencias de filesystem. Descarta trocear audio con `ffmpeg` en el servidor.
- `app/diets/page.tsx` lee `result.error` del cuerpo JSON antes de mirar `response.status`. Cualquier respuesta de error debe llevar `error` en el cuerpo para que el cliente actual la muestre sin tocarlo.

## Goals / Non-Goals

**Goals:**

- Un solo punto de código que invoque al proveedor de transcripción.
- Fallo por tamaño detectado en el servidor antes de gastar una llamada a OpenAI, y distinguible de un fallo del proveedor.
- Cero cambios en `app/diets/page.tsx`.

**Non-Goals:**

- Trocear, recomprimir o transcodificar audio (ni en cliente ni en servidor).
- Cambiar el bitrate o la configuración de `MediaRecorder`.
- Streaming de transcripción.
- Tocar el pipeline de extracción o de generación de dieta aguas abajo.

## Decisions

### D1 — El route handler delega en el servicio; el servicio es la fuente de verdad

`app/api/transcribe/route.ts` pasa a ser una capa fina: valida presencia del audio, llama a `transcribeAudio()` y mapea el resultado a HTTP. El modelo, el idioma, la temperatura y el límite de tamaño viven solo en `src/services/trasncription-service.ts`.

_Alternativa descartada:_ cambiar el modelo en los dos sitios y dejar la duplicación. Más barato hoy, pero el siguiente cambio de modelo vuelve a tener dos puntos que desincronizar — y la duplicación actual es precisamente lo que impedía tocar un solo fichero.

### D2 — Eliminar `app/actions/transcribe.action.ts`

Es código muerto (ningún import) y, como Server Action llamada desde cliente, contradice la regla dura del proyecto. Mantenerlo obligaría a actualizarlo en cada cambio de este servicio sin que nadie lo ejecute nunca.

_Alternativa descartada:_ dejarlo. Se convierte en una segunda ruta de código divergente en cuanto alguien la retome.

### D3 — Validación de tamaño: rechazar, no trocear, con tope propio de 10 MB

`transcribeAudio()` comprueba `audioBlob.size > MAX_AUDIO_BYTES` antes de construir el `File` y devuelve un error de tamaño. El route handler lo mapea a `413`.

El tope se fija en **10 MB**, no en los 25 MB que admite el proveedor. Es un límite nuestro, deliberadamente por debajo del suyo: el cuello de botella real no es OpenAI sino el tamaño de cuerpo que acepta una función serverless en Vercel, que está por debajo de 25 MB. Validar contra 25 MB dejaría una franja de audios que pasan nuestra comprobación y luego fallan en el borde de la plataforma con un error genérico — exactamente el fallo confuso que este cambio quiere evitar. 10 MB también alinea el servicio con el `bodySizeLimit: "10mb"` que el proyecto ya declaraba como intención.

Razonamiento de magnitud: 10 MB de webm/opus son del orden de 40+ minutos de audio. Una consulta de nutrición no se acerca. El coste de trocear (manipulación de audio en servidor) sigue siendo desproporcionado frente a la probabilidad, y además choca con la restricción serverless de Vercel.

_Alternativas descartadas:_

- Usar los 25 MB del proveedor: deja audios que pasan la validación y mueren en el borde de la plataforma.
- Trocear y concatenar: requiere `ffmpeg` o equivalente en el servidor — incompatible con la restricción de filesystem.
- Bajar el bitrate en `MediaRecorder`: toca el componente de grabación y degrada la calidad de entrada justo en el cambio cuyo objetivo es _subir_ la fidelidad.

### D4 — El límite vive como constante nombrada, no como número suelto

El valor 10 MB es una decisión nuestra (ver D3), no el límite del proveedor, así que puede cambiar cuando se mida el tope real de la plataforma. Se declara una vez como constante exportable para que la validación, el test del límite y el mensaje de error se refieran siempre al mismo valor y baste tocar un sitio.

### D5 — Discriminar el error de tamaño sin romper el contrato

`TranscriptionResult` conserva `{ text, error? }`. Para que el route handler distinga "demasiado grande" de "falló el proveedor" sin hacer _string matching_ sobre el mensaje, se añade un campo opcional de código de error (p. ej. `errorCode?: "FILE_TOO_LARGE"`). Es aditivo: los consumidores actuales lo ignoran.

_Alternativa descartada:_ que el servicio lance una excepción tipada. Rompería el estilo actual del servicio, que no lanza nunca y siempre devuelve un resultado.

### D6 — `response_format: "json"` se verifica, no se asume

`gpt-4o-transcribe` no admite todos los formatos de `whisper-1` (no soporta `verbose_json` ni formatos de subtítulos). El código actual usa `"json"`, que sí está soportado, pero la verificación es un paso explícito de la implementación, no una suposición.

### D7 — Verificaciones renunciadas de forma explícita (2026-09-28)

Durante la implementación, el usuario decidió cerrar dos verificaciones sin ejecutarlas. Quedan registradas como renuncias conscientes, no como tareas cumplidas:

- **Sin prueba comparativa A/B de fidelidad.** El criterio de aceptación original comparaba `gpt-4o-transcribe` contra `whisper-1` sobre el mismo audio de consulta, en nombres de alimentos y números. No se ejecutó. Se adopta el modelo nuevo apoyándose en su menor WER declarado para acentos, ruido y velocidad de habla variable. Consecuencia: si hubiera una regresión en algún término concreto del dominio, se descubrirá en uso real y no antes.
- **Sin medición del tope real de body del entorno desplegado.** `MAX_AUDIO_BYTES = 10 MB` queda como valor definitivo. Consecuencia: si el tope de la plataforma resultara inferior a 10 MB, existe una franja de audios que pasan nuestra validación y mueren en el borde con un error genérico. Se acepta el riesgo; cerrarlo más adelante es cambiar una constante.

Lo único verificado contra la API real fue la aceptación de parámetros (D6): `gpt-4o-transcribe` devolvió `HTTP 200` con `language: "es"`, `temperature: 0` y `response_format: "json"`.

## Risks / Trade-offs

- ~~**`gpt-4o-transcribe` rechaza algún parámetro actual**~~ → **cerrado.** Llamada real: `HTTP 200` con `language: "es"`, `temperature: 0` y `response_format: "json"`. No hubo que retirar nada.
- **El tope real de la plataforma resulta estar por debajo de 10 MB** → **riesgo aceptado** (D7). No se mide. Si el cuerpo máximo de una función serverless en Vercel fuera menor que 10 MB, un audio en esa franja pasaría nuestra validación y moriría en el borde con un error genérico. Mitigación disponible si aparece: bajar `MAX_AUDIO_BYTES`, una constante.
- **Regresión de fidelidad en algún término concreto** → **riesgo aceptado** (D7). No se ejecuta la comparación A/B. Se detectaría en uso real, revisando la transcripción de una consulta frente a lo que se dijo.
- **Coste por minuto distinto al de `whisper-1`** → cambio de precio asumido de forma consciente a cambio de menor tasa de error en la entrada crítica del pipeline.
- **Borrar la Server Action** → es código muerto verificado por búsqueda de imports; el riesgo es que exista una referencia dinámica no detectable por grep. Improbable en este código.

## Migration Plan

1. Cambio puramente de código, sin migración de datos ni de esquema.
2. Desplegar; verificar la transcripción de una consulta de prueba en el entorno desplegado.
3. Rollback: revertir el commit. No hay estado persistido que dependa del modelo nuevo — las transcripciones ya guardadas siguen siendo texto plano válido.

## Open Questions

Ninguna abierta. La única que había — el tope real de tamaño de body en el entorno de despliegue — se cerró por decisión, no por medición: 10 MB es el valor definitivo (D7).

## Pendiente al cerrar la implementación

Nada bloqueante. El usuario verificó en navegador (2026-09-28) que `/diets` transcribe con `gpt-4o-transcribe` y genera la dieta de extremo a extremo.

Queda sin ejercitar contra la UI real el **camino de error**: fallo del proveedor y audio por encima de 10 MB. Ambos están cubiertos por tests de ruta (`413` y `500`, con `error` en el cuerpo), y `app/diets/page.tsx` no se tocó, así que el consumo del error sigue siendo el que ya funcionaba. Si el `413` nunca se ha visto en pantalla, el primer caso real es la primera prueba.
