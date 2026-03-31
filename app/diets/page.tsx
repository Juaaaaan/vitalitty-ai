"use client";

import { useEffect, useState } from "react";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { TranscriptionDisplay } from "@/components/audio/transcription-display";
import transcribeAction from "../actions/transcribe.action";
import { processConsultation } from "../actions/save-consultation.action";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Patient } from "@/models/dashboard/patients";
import { supabase } from "../../lib/supabase/client";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function DietsPage() {
  const [transcription, setTranscription] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [patients, setPatients] = useState<Patient[]>([]);

  // New state for the intelligent flow
  const [pendingTranscription, setPendingTranscription] = useState<
    string | null
  >(null);
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);
  const [selectedMatchedPatient, setSelectedMatchedPatient] =
    useState<Patient | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const patientInfoTable = useReactTable({
    data: selectedMatchedPatient ? [selectedMatchedPatient] : [],
    columns: COLUMNS_PATIENTS,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    const { data, error } = await supabase.from("patients").select("*");
    if (error) {
      console.error("Error loading patients:", error);
      return;
    }
    const formattedPatients = data?.map((patient: Patient) => ({
      ...patient,
      gender: patient.gender === "M" ? "Masculino" : "Femenino",
    })) as Patient[];
    setPatients(formattedPatients || []);
  };

  // Function to find matching patients based on transcription
  const findMatchingPatients = (transcriptionText: string): Patient[] => {
    const lowerTranscription = transcriptionText.toLowerCase();

    return patients.filter((patient) => {
      // Check if name appears in transcription
      const nameParts = patient.name_surnames?.toLowerCase().split(" ") || [];
      const nameMatch = nameParts.some((part) =>
        lowerTranscription.includes(part),
      );

      // Check if email appears in transcription
      const emailMatch = patient.mail
        ? lowerTranscription.includes(patient.mail.toLowerCase())
        : false;

      // Check if phone appears in transcription
      const phoneMatch = patient.phone
        ? lowerTranscription.includes(patient.phone)
        : false;

      return nameMatch || emailMatch || phoneMatch;
    });
  };

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setError(undefined);
    setPendingTranscription(null);
    setMatchedPatients([]);
    setSelectedMatchedPatient(null);
    setShowConfirmation(false);

    try {
      // 1. Transcribe audio
      const result = await transcribeAction(audioBlob);

      if (result.error) {
        setError(result.error);
        setIsTranscribing(false);
        return;
      }

      setTranscription(result.text);
      setIsTranscribing(false);

      // 2. PAUSE HERE - Store transcription and look for matches
      console.log("📝 Transcripción completada:", result.text);
      setPendingTranscription(result.text);

      // 3. Try to find matching patients
      const matches = findMatchingPatients(result.text);
      console.log("🔍 Pacientes encontrados:", matches);

      if (matches.length > 0) {
        setMatchedPatients(matches);
        // Auto-select first match if only one found
        if (matches.length === 1) {
          setSelectedMatchedPatient(matches[0]);
        }
        setShowConfirmation(true);
      } else {
        // No matches found - show option to proceed as new patient
        console.log("⚠️ No se encontraron pacientes coincidentes");
        setShowConfirmation(true);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to transcribe audio",
      );
      setIsTranscribing(false);
    }
  };

  const handleConfirmAndProcess = async () => {
    console.log("HOLI");
    if (!pendingTranscription) {
      return;
    }

    console.log("PEPEPEPEPEEPEPEPEPEE");

    setIsProcessing(true);
    setShowConfirmation(false);

    try {
      const saveResult = await processConsultation(
        pendingTranscription,
        selectedMatchedPatient?.id, // Pass patient ID if matched
      );

      if (!saveResult.success) {
        setError(saveResult.error || "Failed to process consultation");
      } else {
        console.log(
          "✅ Consulta procesada exitosamente!",
          saveResult.patientId,
        );
        // Reset state after successful processing
        setPendingTranscription(null);
        setMatchedPatients([]);
        setSelectedMatchedPatient(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process consultation",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelProcess = () => {
    setPendingTranscription(null);
    setMatchedPatients([]);
    setSelectedMatchedPatient(null);
    setShowConfirmation(false);
    setTranscription("");
  };

  const onRetryRecording = () => {
    setTranscription("");
    setError(undefined);
    setPendingTranscription(null);
    setMatchedPatients([]);
    setSelectedMatchedPatient(null);
    setShowConfirmation(false);
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="mb-2">
        <h2 className="text-2xl font-light text-gray-900 dark:text-white">
          Dietas - Flujo Inteligente
        </h2>
      </div>

      <Separator
        orientation="horizontal"
        className="h-full mb-8 dark:bg-gray-700"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Recording & Transcription */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Grabación de Audio</CardTitle>
              <CardDescription>
                Graba la consulta del paciente. El sistema buscará
                automáticamente coincidencias con pacientes existentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 animate-pulse">
                  <div className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                  Procesando consulta y generando dieta...
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Confirmation & Patient Info */}
        <div className="space-y-6">
          {showConfirmation && pendingTranscription && (
            <Card className="border-2 border-blue-500 dark:border-blue-400">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {matchedPatients.length > 0 ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Paciente Encontrado
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-orange-600" />
                      Paciente Nuevo
                    </>
                  )}
                </CardTitle>
                <CardDescription>
                  {matchedPatients.length > 0
                    ? "Se encontraron coincidencias con pacientes existentes"
                    : "No se encontraron coincidencias. Se creará un nuevo paciente."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {matchedPatients.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">
                      Pacientes coincidentes:
                    </p>
                    {matchedPatients.map((patient) => (
                      <div
                        key={patient.id}
                        onClick={() => setSelectedMatchedPatient(patient)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedMatchedPatient?.id === patient.id
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                            : "border-gray-200 dark:border-gray-700 hover:border-blue-300"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">
                              {patient.name_surnames}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {patient.mail}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {patient.phone}
                            </p>
                          </div>
                          {selectedMatchedPatient?.id === patient.id && (
                            <Badge variant="default">Seleccionado</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {matchedPatients.length === 0 && (
                  <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Se creará un nuevo paciente con la información extraída de
                      la transcripción.
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex gap-3">
                <Button
                  onClick={handleConfirmAndProcess}
                  className="flex-1"
                  disabled={
                    matchedPatients.length > 1 && !selectedMatchedPatient
                  }
                >
                  {matchedPatients.length > 0
                    ? "Confirmar y Generar Dieta"
                    : "Crear Paciente y Generar Dieta"}
                </Button>
                <Button
                  onClick={handleCancelProcess}
                  variant="outline"
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Patient Info Table */}
          {selectedMatchedPatient && (
            <Card>
              <CardHeader>
                <CardTitle>Información del Paciente</CardTitle>
                <CardDescription>
                  Datos existentes del paciente seleccionado
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      {patientInfoTable.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {patientInfoTable.getRowModel().rows?.length ? (
                        patientInfoTable.getRowModel().rows.map((row) => (
                          <TableRow key={row.id}>
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
                            Sin información
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
