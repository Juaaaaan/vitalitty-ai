import { TranscriptionResult } from "@/models/audio/transcription.model";
import openai from "../../lib/ai/openai";

/**
 * Tope propio, por debajo de los 25 MB que admite el proveedor: el cuello de
 * botella real es el tamaño de cuerpo que acepta una función serverless en
 * Vercel. Validar contra el límite del proveedor dejaría audios que pasan esta
 * comprobación y luego mueren en el borde con un error genérico.
 */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

export async function transcribeAudio(
  audioBlob: Blob,
): Promise<TranscriptionResult> {
  if (audioBlob.size > MAX_AUDIO_BYTES) {
    return {
      text: "",
      error:
        "La grabación es demasiado larga (máximo 10 MB). Divide la consulta en varias grabaciones o vuelve a grabarla.",
      errorCode: "FILE_TOO_LARGE",
    };
  }

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const file = new File([arrayBuffer], "audio.webm", { type: "audio/webm" });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
      language: "es",
      response_format: "json",
      temperature: 0,
    });

    return {
      text: transcription.text,
    };
  } catch (error) {
    console.error("Transcription error:", error);
    return {
      text: "",
      error:
        error instanceof Error ? error.message : "Failed to transcribe audio",
    };
  }
}
