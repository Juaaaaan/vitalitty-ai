"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { TranscriptionDisplay } from "@/components/audio/transcription-display";
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
import { CHOOSE_PATIENT_TO_RECORD_MESSAGE } from "@/constants/patient-memory";
import type { PatientMode } from "@/models/patient-context/patient-memory.models";
import { PatientPicker } from "@/components/patients/patient-picker";
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
import {
  CheckCircle2,
  AlertCircle,
  Download,
  FileText,
  Upload,
  ExternalLink,
  UserPlus,
  Users,
} from "lucide-react";

export default function DietsPage() {
  const [transcription, setTranscription] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [patients, setPatients] = useState<Patient[]>([]);

  // Elección explícita antes de grabar: nunca se adivina por la transcripción.
  const [patientMode, setPatientMode] = useState<PatientMode | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [pendingTranscription, setPendingTranscription] = useState<
    string | null
  >(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [generatedDietMd, setGeneratedDietMd] = useState<string | null>(null);
  const [thinkingSummary, setThinkingSummary] = useState("");
  const [generationInterrupted, setGenerationInterrupted] = useState(false);
  const [, startTransition] = useTransition();
  const [generatedPatientName, setGeneratedPatientName] = useState<string>("");
  const [dietVersion, setDietVersion] = useState<number | null>(null);

  // Estado para subida de dieta
  const [savedConsultationId, setSavedConsultationId] = useState<string | null>(
    null,
  );
  const [savedPatientId, setSavedPatientId] = useState<string | null>(null);
  const [isSavingDiet, setIsSavingDiet] = useState(false);
  const [dietSavedUrl, setDietSavedUrl] = useState<string | null>(null);
  const [dietSaveError, setDietSaveError] = useState<string | null>(null);

  // `data` tiene que ser una referencia estable. Un array nuevo en cada render
  // hace que TanStack Table recalcule filas y resetee la paginación, lo que
  // dispara otro render, y así en bucle: con la tabla montada, cualquier
  // setState (p. ej. cada fragmento del stream) congela la pestaña entera.
  const selectedPatient = useMemo(
    () =>
      patientMode === "existing"
        ? (patients.find((patient) => patient.id === selectedPatientId) ?? null)
        : null,
    [patientMode, patients, selectedPatientId],
  );

  const patientInfoData = useMemo(
    () => (selectedPatient ? [selectedPatient] : []),
    [selectedPatient],
  );

  const isPatientChosen =
    patientMode === "new" ||
    (patientMode === "existing" && selectedPatient !== null);

  // Una vez grabada la consulta, la elección queda fijada hasta "Nueva consulta".
  const isPatientChoiceLocked =
    pendingTranscription !== null || generatedDietMd !== null;

  const patientInfoTable = useReactTable({
    data: patientInfoData,
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

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setError(undefined);
    setPendingTranscription(null);
    setShowConfirmation(false);
    setGeneratedDietMd(null);
    setDietVersion(null);
    // Resetear estado de subida al iniciar nueva grabación
    setSavedConsultationId(null);
    setSavedPatientId(null);
    setDietSavedUrl(null);
    setDietSaveError(null);

    try {
      // Usamos fetch con FormData — sin Server Actions en esta página
      const formData = new FormData();
      formData.append(
        "audio",
        new File([audioBlob], "audio.webm", { type: "audio/webm" }),
      );

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
        return;
      }

      // Guard: transcripción vacía
      if (!result.text || result.text.trim() === "") {
        setError("La transcripción volvió vacía. Intenta grabar de nuevo.");
        return;
      }

      setTranscription(result.text);

      setPendingTranscription(result.text);
      setShowConfirmation(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to transcribe audio",
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleConfirmAndProcess = async () => {
    if (!pendingTranscription || !isPatientChosen) {
      return;
    }

    // Varios setState en el mismo handler: sin useTransition la UI se congela
    // durante el stream, sin error ni traza.
    startTransition(() => {
      setGeneratedDietMd("");
      setThinkingSummary("");
      setGenerationInterrupted(false);
      setGeneratedPatientName(selectedPatient?.name_surnames ?? "Paciente");
      setDietVersion(null);
      setShowConfirmation(false);
      setError(undefined);
    });

    let markdown = "";

    try {
      const response = await fetch("/api/process-consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription: pendingTranscription,
          patientMode,
          patientId: patientMode === "existing" ? selectedPatient?.id : null,
        }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Server error: ${response.statusText}`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // El servidor emite NDJSON: un evento por línea.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === "text") {
            markdown += event.text;
            setGeneratedDietMd(markdown);
          } else if (event.type === "thinking") {
            setThinkingSummary((current) => current + event.text);
          } else if (event.type === "error") {
            // El markdown ya emitido se conserva en pantalla a propósito.
            startTransition(() => {
              setError(event.message);
              setThinkingSummary("");
              setGenerationInterrupted(true);
            });
          } else if (event.type === "done") {
            startTransition(() => {
              setThinkingSummary("");
              setSavedConsultationId(event.consultationId);
              setSavedPatientId(event.patientId);
              setDietVersion(event.dietVersion ?? null);
              setGeneratedPatientName(
                selectedPatient?.name_surnames ??
                  event.patientName ??
                  "Paciente",
              );
              setPendingTranscription(null);
            });
          }
        }
      }
    } catch (err) {
      // La conexión puede caerse a mitad del stream: el texto recibido se queda.
      startTransition(() => {
        setError(
          err instanceof Error ? err.message : "Failed to process consultation",
        );
        setThinkingSummary("");
        setGenerationInterrupted(true);
      });
    } finally {
      startTransition(() => {
        setIsProcessing(false);
        setIsTranscribing(false);
      });
    }
  };

  const handleSaveDiet = async () => {
    if (!savedConsultationId || !savedPatientId || !generatedDietMd) return;

    setIsSavingDiet(true);
    setDietSaveError(null);

    try {
      const response = await fetch("/api/upload-diet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultationId: savedConsultationId,
          patientId: savedPatientId,
          dietMd: generatedDietMd,
        }),
      });

      const result = await response.json();

      if (result.success && result.url) {
        setDietSavedUrl(result.url);
      } else {
        setDietSaveError(result.error ?? "Error al guardar la dieta");
      }
    } catch (err) {
      setDietSaveError(
        err instanceof Error ? err.message : "Error al guardar la dieta",
      );
    } finally {
      setIsSavingDiet(false);
    }
  };

  const handleDownloadMd = () => {
    if (!generatedDietMd) return;

    const fileName = `dieta-${generatedPatientName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.md`;
    const blob = new Blob([generatedDietMd], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();

    URL.revokeObjectURL(url);
  };

  const handleCancelProcess = () => {
    setPendingTranscription(null);
    setShowConfirmation(false);
    setTranscription("");
  };

  const onRetryRecording = () => {
    setTranscription("");
    setError(undefined);
    setPendingTranscription(null);
    setShowConfirmation(false);
    setGeneratedDietMd(null);
    setDietVersion(null);
    setSavedConsultationId(null);
    setSavedPatientId(null);
    setDietSavedUrl(null);
    setDietSaveError(null);
  };

  // Otra consulta puede ser de otro paciente: la elección se vuelve a pedir.
  const handleNewConsultation = () => {
    onRetryRecording();
    setPatientMode(null);
    setSelectedPatientId(null);
  };

  const choosePatientMode = (mode: PatientMode) => {
    setPatientMode(mode);
    if (mode === "new") setSelectedPatientId(null);
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
                Indica primero si el paciente es nuevo o ya existe. Después,
                graba la consulta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div
                  role="radiogroup"
                  aria-label="Tipo de paciente"
                  className="grid grid-cols-2 gap-3"
                >
                  <Button
                    role="radio"
                    aria-checked={patientMode === "new"}
                    variant={patientMode === "new" ? "default" : "outline"}
                    disabled={isPatientChoiceLocked}
                    onClick={() => choosePatientMode("new")}
                    className="gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    Paciente nuevo
                  </Button>
                  <Button
                    role="radio"
                    aria-checked={patientMode === "existing"}
                    variant={patientMode === "existing" ? "default" : "outline"}
                    disabled={isPatientChoiceLocked}
                    onClick={() => choosePatientMode("existing")}
                    className="gap-2"
                  >
                    <Users className="h-4 w-4" />
                    Paciente existente
                  </Button>
                </div>

                {patientMode === "existing" && !isPatientChoiceLocked && (
                  <PatientPicker
                    patients={patients}
                    selectedId={selectedPatientId}
                    onSelect={setSelectedPatientId}
                  />
                )}

                {patientMode === "existing" && !selectedPatient && (
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    {CHOOSE_PATIENT_TO_RECORD_MESSAGE}
                  </p>
                )}
                {patientMode === null && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Elige &quot;Paciente nuevo&quot; o &quot;Paciente
                    existente&quot; para empezar a grabar
                  </p>
                )}
              </div>

              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                onRetryRecording={onRetryRecording}
                disabled={!isPatientChosen}
              />

              <TranscriptionDisplay
                text={transcription}
                isLoading={isTranscribing}
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

        {generatedDietMd !== null && (
          <Card
            className={
              savedConsultationId
                ? "border-2 border-green-500 dark:border-green-400"
                : generationInterrupted
                  ? "border-2 border-orange-500 dark:border-orange-400"
                  : "border-2 border-blue-400 dark:border-blue-500"
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {savedConsultationId ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : generationInterrupted ? (
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                ) : (
                  <FileText className="h-5 w-5 animate-pulse text-blue-600" />
                )}
                {savedConsultationId
                  ? "Dieta generada"
                  : generationInterrupted
                    ? "Dieta incompleta"
                    : "Generando dieta…"}
              </CardTitle>
              <CardDescription>
                {savedConsultationId
                  ? `La dieta de ${generatedPatientName}${dietVersion != null ? ` (versión ${dietVersion})` : ""} ha sido guardada y está lista para descargar.`
                  : generationInterrupted
                    ? "La generación se interrumpió antes de terminar. El texto de abajo está incompleto y no se ha guardado."
                    : `Escribiendo la dieta de ${generatedPatientName}. Puedes ir leyéndola.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Hueco mientras el modelo razona y todavía no escribe documento. */}
              {thinkingSummary && !generatedDietMd && (
                <div className="rounded-lg border border-dashed p-4">
                  <p className="text-xs whitespace-pre-wrap text-gray-500 dark:text-gray-400">
                    {thinkingSummary}
                  </p>
                </div>
              )}

              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border p-4 max-h-[60vh] overflow-y-auto">
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                  {generatedDietMd}
                </pre>
              </div>

              {/* Sección de subida */}
              {dietSavedUrl ? (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Dieta guardada en la nube.</span>
                  <a
                    href={dietSavedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline font-medium"
                  >
                    Ver fichero
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleSaveDiet}
                    disabled={isSavingDiet || !savedConsultationId}
                    className="w-full gap-2"
                    variant="default"
                  >
                    <Upload className="h-4 w-4" />
                    {isSavingDiet ? "Guardando en la nube…" : "Guardar dieta"}
                  </Button>
                  {dietSaveError && (
                    <p className="text-xs text-red-500">{dietSaveError}</p>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button
                onClick={handleDownloadMd}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Download className="h-4 w-4" />
                Descargar .md
              </Button>
              <Button
                variant="outline"
                onClick={handleNewConsultation}
                className="flex-1 gap-2"
              >
                <FileText className="h-4 w-4" />
                Nueva consulta
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Right Column - Confirmation & Patient Info */}
        <div className="space-y-6">
          {showConfirmation && pendingTranscription !== null && (
            <Card className="border-2 border-blue-500 dark:border-blue-400">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {patientMode === "existing" ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Revisión de {selectedPatient?.name_surnames}
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-5 w-5 text-blue-600" />
                      Paciente nuevo
                    </>
                  )}
                </CardTitle>
                <CardDescription>
                  {patientMode === "existing"
                    ? "Se usará su ficha, sus consultas recientes y su última dieta como contexto."
                    : "Se creará un paciente nuevo con los datos dictados en el audio."}
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex gap-3">
                <Button
                  onClick={handleConfirmAndProcess}
                  className="flex-1"
                  disabled={!isPatientChosen || isProcessing}
                >
                  {isProcessing
                    ? "Generando dieta..."
                    : patientMode === "existing"
                      ? "Generar dieta"
                      : "Crear paciente y generar dieta"}
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
          {selectedPatient && (
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
