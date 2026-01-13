"use client";

import { useEffect, useState } from "react";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { TranscriptionDisplay } from "@/components/audio/transcription-display";
import transcribeAction from "../actions/transcribe.action";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Patient } from "@/models/dashboard/patients";
import { supabase } from "../../lib/supabase/client";
import { ComboBox } from "@/components/layout/app-comboBox";

export default function DietsPage() {
  useEffect(() => {
    handleSelectPatient();
  }, []);

  const [transcription, setTranscription] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string>();
  const [isPatientNew, setIsPatientNew] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);

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

  const checkIsNewPatient = (checked: boolean) => {
    setIsPatientNew(checked);
    return checked;
  };

  const handleSelectPatient = () => {
    const getPatients = async () => {
      const { data, error } = await supabase.from("patients").select("*");
      data?.map((patient: Patient) => {
        patient.gender = patient.gender === "M" ? "Masculino" : "Femenino";
      });
      return { data, error };
    };
    getPatients()
      .then(({ data, error }) => {
        if (error) {
          console.log(error);
          return;
        }
        setPatients(
          data?.map((patient: Patient) => ({
            ...patient,
            value: patient.id,
            label: patient.name_surnames,
          })) as Patient[]
        );
      })
      .finally(() => console.log("finally"));
  };

  return (
    <div className="min-h-screen p-8">
      <div className="mb-2">
        <h2 className="text-2xl font-light">Dietas, pacientes y más... </h2>
      </div>

      <Separator orientation="horizontal" className="h-full mb-8" />

      <div className="flex flex-row space-x-8">
        <div className="flex flex-col">
          <section>
            <span className="text-md font-light">
              1. Lo primero que debes hacer es seleccionar si es un paciente
              nuevo o un paciente existente
            </span>
            <div className="flex flex-row m-4 items-center">
              <span className="mr-4">¿Es nuevo?</span>
              <Switch
                onCheckedChange={(checked) => checkIsNewPatient(checked)}
              />
              <span className="ml-4">¿Existe?</span>
            </div>
          </section>

          {isPatientNew && (
            <div>
              <section>
                <span className="text-md font-light">
                  2. Luego, debes seleccionar el usuario
                </span>
                <div className="flex flex-row m-4 items-center">
                  <p className="mr-4">Puedes seleccionar y buscar el usuario</p>
                  <ComboBox users={patients} />
                </div>
              </section>
              <section>
                <span className="text-md font-light">
                  3. Te aparecerá información relevante del usuarios así como
                  sus anteriores dietas
                </span>
              </section>
            </div>
          )}
        </div>

        <div>
          <Separator orientation="vertical" className="h-full mb-8" />
        </div>
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
    </div>
  );
}
