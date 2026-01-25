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

    // With the trasncription I need to call ChatGPT to prompt the transcription with the goal: get a diet plan for the patient
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Usted es nutricionista titulado y dietista profesional. Su objetivo es desarrollar un plan de alimentación para el paciente basándose en la siguiente transcripción.",
        },
        {
          role: "user",
          content: transcription.text,
        },
      ],
    });

    console.log({ chatCompletion });

    return {
      text: chatCompletion.choices[0].message.content ?? "",
    };
  } catch (error) {
    return {
      text: "",
      error:
        error instanceof Error ? error.message : "Failed to transcribe audio",
    };
  }
}
