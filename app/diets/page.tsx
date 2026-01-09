"use client";

import { useState } from "react";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { TranscriptionDisplay } from "@/components/audio/transcription-display";
import transcribeAction from "../actions/transcribe.action";

export default function DietsPage() {
  const [transcription, setTranscription] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string>();

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setError(undefined);

    try {
      // THIS IS WHERE OPENAI COME INTO PLAY
      const result = await transcribeAction(audioBlob);
      if (result.error) {
        setError(result.error);
      } else {
        setTranscription(result.text);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to transcribe audio"
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const onRetryRecording = () => {
    setTranscription("");
    setError(undefined);
  };

  return (
    <div className="min-h-screen p-8">
      <div className="flex flex-col">
        <div className="w-full space-y-8">
          <h3 className="text-2xl font-light">
            Grabación y transcripción del paciente
          </h3>

          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            onRetryRecording={onRetryRecording}
          />

          <TranscriptionDisplay
            text={transcription}
            isLoading={isTranscribing}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}
