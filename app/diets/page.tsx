"use client";

import { useEffect, useState } from "react";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { TranscriptionDisplay } from "@/components/audio/transcription-display";
import transcribeAction from "../actions/transcribe.action";
import { processConsultation } from "../actions/save-consultation.action";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Patient } from "@/models/dashboard/patients";
import { supabase } from "../../lib/supabase/client";
import { ComboBox } from "@/components/layout/app-comboBox";
import {
  PatientData,
  PatientDataParsed,
} from "@/models/extraction/extraction.models";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { COLUMNS_PATIENTS } from "@/constants/dashboard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DietsPage() {
  const [transcription, setTranscription] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Processing extraction
  const [error, setError] = useState<string>();
  const [isPatientNew, setIsPatientNew] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<
    string | undefined
  >();

  const [patientInfo, setPatientInfo] = useState<Patient[]>([]);

  const patientInfoTable = useReactTable({
    data: patientInfo,
    columns: COLUMNS_PATIENTS,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  useEffect(() => {
    handleSelectPatient();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      const getInfoPatient = async (): Promise<Patient[]> => {
        const { data, error } = await supabase
          .from("patients")
          .select("*")
          .eq("id", selectedPatientId);
        if (error) {
          console.log(error);
          return [];
        }
        return data;
      };
      getInfoPatient()
        .then((data) => {
          setPatientInfo(data);
        })
        .catch((err) => {
          console.error(err);
        })
        .finally(() => {
          console.log("finally");
        });
    }
  }, [selectedPatientId]);

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setError(undefined);

    try {
      // 1. Transcribe
      const result = await transcribeAction(audioBlob);

      if (result.error) {
        setError(result.error);
        setIsTranscribing(false);
        return;
      }

      setTranscription(result.text);
      setIsTranscribing(false); // Stop transcribing spinner, start processing spinner?

      // 2. Process & Save (Extract Data)
      setIsProcessing(true);

      // Determine if we have a selected patient (only if "Exists" switch is ON)
      const patientIdToLink = isPatientNew ? selectedPatientId : undefined;

      const saveResult = await processConsultation(
        result.text,
        patientIdToLink,
      );

      if (!saveResult.success) {
        setError(saveResult.error || "Failed to process consultation");
      } else {
        console.log(
          "Consultation processed successfully!",
          saveResult.patientId,
        );
        // Maybe we can append a success message to the transcription or show a toast
        // For now, let's just make sure we don't error out.
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to transcribe audio",
      );
      setIsTranscribing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const onRetryRecording = () => {
    setTranscription("");
    setError(undefined);
  };

  const checkIsNewPatient = (checked: boolean) => {
    setIsPatientNew(checked);
    // Reset selection if toggled
    if (!checked) setSelectedPatientId(undefined);
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
          })) as Patient[],
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
              <b>1.</b> Lo primero que debes hacer es seleccionar si es un
              paciente nuevo o un paciente existente
            </span>
            <div className="flex flex-row m-4 items-center">
              <span className="mr-4">¿Es nuevo?</span>
              <Switch
                checked={isPatientNew}
                onCheckedChange={(checked) => checkIsNewPatient(checked)}
              />
              <span className="ml-4">¿Existe?</span>
            </div>
          </section>

          {isPatientNew && (
            <div>
              <section>
                <span className="text-md font-light">
                  <b>2.</b> Luego, debes seleccionar el usuario
                </span>
                <div className="flex flex-col m-4">
                  <p className="mb-2">Puedes seleccionar y buscar el usuario</p>
                  <ComboBox users={patients} onSelect={setSelectedPatientId} />
                </div>
              </section>
              <section>
                <span className="text-md font-light">
                  <b>3.</b> Te aparecerá información relevante del usuarios así
                  como sus anteriores dietas
                </span>
                <div>
                  <div className="mt-8 shadow-md rounded-4xl p-8 overflow-hidden max-h-[calc(100vh-20rem)]">
                    <Table>
                      <TableHeader>
                        {patientInfoTable
                          .getHeaderGroups()
                          .map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                              {headerGroup.headers.map((header) => {
                                return (
                                  <TableHead key={header.id}>
                                    {header.isPlaceholder
                                      ? null
                                      : flexRender(
                                          header.column.columnDef.header,
                                          header.getContext(),
                                        )}
                                  </TableHead>
                                );
                              })}
                            </TableRow>
                          ))}
                      </TableHeader>
                      <TableBody>
                        {patientInfoTable.getRowModel().rows?.length ? (
                          patientInfoTable.getRowModel().rows.map((row) => (
                            <TableRow
                              key={row.id}
                              data-state={row.getIsSelected() && "selected"}
                            >
                              {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={COLUMNS_PATIENTS.length}
                              className="h-24 text-center"
                            >
                              Sin resultados
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <div>
          <Separator orientation="vertical" className="h-full mb-8" />
        </div>
        <div className="flex flex-col">
          <div className="w-full space-y-8">
            <div>
              <h3 className="text-2xl font-light">
                Grabación y transcripción del paciente
              </h3>
              <span className="text-md font-light">
                Automáticamente se añadirá la información del paciente y se
                gestionará la creación de la dieta
              </span>
            </div>

            <AudioRecorder
              onRecordingComplete={handleRecordingComplete}
              onRetryRecording={onRetryRecording}
            />

            <TranscriptionDisplay
              text={transcription}
              isLoading={isTranscribing || isProcessing}
              error={error}
            />
            {isProcessing && (
              <p className="text-sm text-gray-500 animate-pulse">
                Analizando información y guardando datos...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
