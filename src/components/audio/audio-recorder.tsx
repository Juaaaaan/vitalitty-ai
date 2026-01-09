import { Mic, RotateCcw, StopCircle } from "lucide-react";
import { useState, useRef } from "react";
import { Button } from "../ui/button";

type AudioRecorderProps = {
  onRetryRecording: () => void;
  onRecordingComplete: (audioBlob: Blob) => void;
};

export function AudioRecorder({
  onRetryRecording,
  onRecordingComplete,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const handleStartRecording = async () => {
    // Clear any previously recorded audio URL from state
    setRecordedAudioUrl(null);

    // Reset the array that stores audio chunks
    audioChunksRef.current = [];

    // Request access to the user's microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create a new MediaRecorder instance using the audio stream
    const mediaRecorder = new MediaRecorder(stream);

    // Save the recorder instance to the ref so it can be accessed later
    mediaRecorderRef.current = mediaRecorder;

    // When audio data is available (every 500ms), store it in the chunks array
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    });

    // When recording stops, combine chunks and trigger callback
    mediaRecorder.addEventListener("stop", () => {
      // Combine the audio chunks into a single Blob
      const audioBlob = new Blob(audioChunksRef.current, {
        type: "audio/webm",
      });

      // Create a URL from the Blob for audio playback
      const audioUrl = URL.createObjectURL(audioBlob);

      // Save the playback URL in state
      setRecordedAudioUrl(audioUrl);

      // Notify parent component with the final audio Blob
      onRecordingComplete(audioBlob);
    });

    // Start recording and collect audio chunks every 500ms
    mediaRecorder.start(500);

    // Set recording state to true
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    // If recording is active
    if (mediaRecorderRef.current) {
      // Stop the media recorder (this triggers the 'stop' event)
      mediaRecorderRef.current.stop();

      // Stop all tracks from the media stream to release the microphone
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());

      // Update recording state to false
      setIsRecording(false);
    }
  };

  const handleRecordAgain = () => {
    // Clear the previously recorded audio URL
    setRecordedAudioUrl(null);

    // Reset the stored audio chunks
    audioChunksRef.current = [];

    // Set recording state to false (just in case)
    setIsRecording(false);

    // Notify parent component that recording is being restarted
    onRetryRecording();
  };

  return (
    <div className="flex flex-col gap-4">
      {/*
        - Mostrar un indicador de grabación en progreso
        - isRecording debe ser verdadero cuando se hace clic en el botón
      */}
      {isRecording && (
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-gray-600">Grabando...</span>
        </div>
      )}

      {/*
        - Mostrar audio grabado y botón de grabar de nuevo
        - handleRecordAgain cuando se hace clic en el botón
        - recordedAudioUrl debe ser nulo cuando se hace clic en el botón
      */}

      {!recordedAudioUrl && (
        <Button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-white ${
            isRecording
              ? "bg-red-600 hover:bg-red-700"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isRecording ? (
            <>
              <StopCircle className="w-4 h-4" />
              Parar la grabación
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Empezar a grabar
            </>
          )}
        </Button>
      )}

      {/*
        - Mostrar audio grabado y botón de grabar de nuevo
        - handleRecordAgain cuando se hace clic en el botón
        - recordedAudioUrl debe ser nulo cuando se hace clic en el botón
      */}

      {recordedAudioUrl && (
        <>
          <div className="flex items-center gap-4">
            <audio src={recordedAudioUrl} controls />

            <Button className="" onClick={handleRecordAgain}>
              <RotateCcw className="w-4 h-4" />
              Grabar de nuevo
            </Button>
          </div>
          <p className="text-gray-600">
            {!document.createElement("audio").canPlayType("audio/webm") &&
              "Tu navegador no soporta el elemento audio."}
          </p>
        </>
      )}
    </div>
  );
}
