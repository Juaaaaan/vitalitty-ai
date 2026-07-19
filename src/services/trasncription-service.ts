import { TranscriptionResult } from "@/models/audio/transcription.model";
import openai from "../../lib/ai/openai";

export async function transcribeAudio(
  audioBlob: Blob,
): Promise<TranscriptionResult> {
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const file = new File([arrayBuffer], "audio.webm", { type: "audio/webm" });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "es",
      response_format: "json",
      temperature: 0,
    });

    console.log({ transcription });

    return {
      text: transcription.text,
    };
  } catch (error) {
    return {
      text: "",
      error:
        error instanceof Error ? error.message : "Failed to transcribe audio",
    };
  }
}
