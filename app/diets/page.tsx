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
import {
  CheckCircle2,
  AlertCircle,
  Download,
  FileText,
  Upload,
  ExternalLink,
} from "lucide-react";

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
  const [generatedDietMd, setGeneratedDietMd] = useState<string | null>(null);
  const [thinkingSummary, setThinkingSummary] = useState("");
  const [generationInterrupted, setGenerationInterrupted] = useState(false);
  const [, startTransition] = useTransition();
  const [generatedPatientName, setGeneratedPatientName] = useState<string>("");

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
  const patientInfoData = useMemo(
    () => (selectedMatchedPatient ? [selectedMatchedPatient] : []),
    [selectedMatchedPatient],
  );

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
    setGeneratedDietMd(null);
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

      console.log("📝 Transcripción completada:", result.text);
      setPendingTranscription(result.text);

      const matches = findMatchingPatients(result.text);
      console.log("🔍 Pacientes encontrados:", matches);

      setMatchedPatients(matches);
      if (matches.length === 1) {
        setSelectedMatchedPatient(matches[0]);
      }
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
    if (!pendingTranscription) {
      return;
    }

    // Varios setState en el mismo handler: sin useTransition la UI se congela
    // durante el stream, sin error ni traza.
    startTransition(() => {
      setGeneratedDietMd("");
      setThinkingSummary("");
      setGenerationInterrupted(false);
      setGeneratedPatientName(
        selectedMatchedPatient?.name_surnames ?? "Paciente",
      );
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
          existingPatientId: selectedMatchedPatient?.id ?? null,
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
              setGeneratedPatientName(
                selectedMatchedPatient?.name_surnames ??
                  event.patientName ??
                  "Paciente",
              );
              setPendingTranscription(null);
              setMatchedPatients([]);
              setSelectedMatchedPatient(null);
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
    setGeneratedDietMd(null);
    setSavedConsultationId(null);
    setSavedPatientId(null);
    setDietSavedUrl(null);
    setDietSaveError(null);
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
                  ? `La dieta de ${generatedPatientName} ha sido guardada y está lista para descargar.`
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
                onClick={onRetryRecording}
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
                    (matchedPatients.length > 1 && !selectedMatchedPatient) ||
                    isProcessing
                  }
                >
                  {isProcessing
                    ? "Generando dieta..."
                    : matchedPatients.length > 0
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
