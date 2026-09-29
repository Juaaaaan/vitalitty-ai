"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase/client";
import { Patient } from "@/models/dashboard/patients";
import { ConsultationData } from "@/models/extraction/extraction.models";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeftIcon,
  UserIcon,
  ScaleIcon,
  RulerIcon,
  CalendarIcon,
  PhoneIcon,
  MailIcon,
  FileTextIcon,
  CheckCircle2Icon,
  ClockIcon,
} from "lucide-react";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { MAGIC_NUMBERS } from "@/constants/magic-numbers";
import { buildEvolutionData } from "@/services/patient-evolution-service";
import { DietComparison } from "@/components/patients/diet-comparison";
import { PortionsChart } from "@/components/patients/portions-chart";
import type { DietPortions } from "@/models/diet-comparison/diet-comparison.models";

interface PatientDetailPageProps {
  params: Promise<{ id: string }>;
}

// Extended ConsultationData with DB fields
interface ConsultationRecord extends ConsultationData {
  id: string;
  patient_id: string;
  created_at: string;
  created_by: string;
  diet_md?: string | null;
  documento_url?: string | null;
  dieta_generada?: string | null;
  diet_portions?: DietPortions | null;
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const chartConfig = {
  calorias: {
    label: "Kcal objetivo",
    color: "var(--chart-1)",
  },
  peso: {
    label: "Peso (kg)",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export default function PatientDetailPage({ params }: PatientDetailPageProps) {
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<ConsultationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string>("");

  // El bucket "diets" es privado: `documento_url` guarda la ruta del fichero y
  // el enlace se firma en el momento de abrirlo, con validez corta.
  const openDiet = async (path: string) => {
    // La pestaña se abre dentro del clic: abierta tras el await, el navegador
    // la bloquearía como popup.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;

    const { data, error } = await supabase.storage
      .from("diets")
      .createSignedUrl(path, 60);

    if (error || !data) {
      console.error("Error signing diet URL:", error);
      tab?.close();
      return;
    }

    if (tab) tab.location.href = data.signedUrl;
  };

  useEffect(() => {
    params.then((resolvedParams) => {
      setPatientId(resolvedParams.id);
    });
  }, [params]);

  useEffect(() => {
    if (!patientId) return;

    const fetchPatient = async () => {
      try {
        setLoading(true);
        const [patientData, consultationsData] = await Promise.all([
          supabase.from("patients").select("*").eq("id", patientId).single(),
          supabase
            .from("patient_consultations")
            .select("*")
            .eq("patient_id", patientId)
            .order("created_at", { ascending: true }),
        ]);

        if (patientData.error || consultationsData.error) {
          throw patientData.error || consultationsData.error;
        }

        setPatient(patientData.data);
        setConsultations(consultationsData.data || []);
      } catch (err) {
        console.error("Error fetching patient:", err);
        setError(
          err instanceof Error ? err.message : "Error al cargar el paciente",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPatient();
  }, [patientId]);

  // Un punto por consulta con kcal o peso; cada serie en su propio eje.
  const chartData = useMemo(
    () => buildEvolutionData(consultations),
    [consultations],
  );

  const consultationsWithDiet = consultations.filter((c) => c.diet_md);
  const latestConsultation = consultations.at(-1);

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Cargando información del paciente…
        </p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-4"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver al Dashboard
          </Button>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 dark:text-red-400 mb-2">
              Error
            </h2>
            <p className="text-red-600 dark:text-red-300">
              {error || "No se pudo encontrar el paciente"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const genderLabel = patient.gender === "M" ? "Masculino" : "Femenino";

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ── Header ── */}
        <div>
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-4 -ml-2"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver al Dashboard
          </Button>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            {patient.name_surnames}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {consultations.length}{" "}
            {consultations.length === 1
              ? "consulta registrada"
              : "consultas registradas"}
            {consultationsWithDiet.length > MAGIC_NUMBERS.ZERO && (
              <>
                {" "}
                · {consultationsWithDiet.length}{" "}
                {consultationsWithDiet.length === 1
                  ? "dieta generada"
                  : "dietas generadas"}
              </>
            )}
          </p>
        </div>

        <Separator className="dark:bg-gray-700" />

        {/* ── Datos del paciente ── */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            Datos del paciente
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-2">
              <UserIcon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Género
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {genderLabel}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarIcon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Edad</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {patient.age ? `${patient.age} años` : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ScaleIcon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Peso</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {patient.weight ? `${patient.weight} kg` : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <RulerIcon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Altura
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {patient.height ? `${patient.height} cm` : "—"}
                </p>
              </div>
            </div>
            {patient.mail && (
              <div className="flex items-start gap-2">
                <MailIcon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Email
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white break-all">
                    {patient.mail}
                  </p>
                </div>
              </div>
            )}
            {patient.phone && (
              <div className="flex items-start gap-2">
                <PhoneIcon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Teléfono
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {patient.phone}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Objetivo más reciente */}
          {latestConsultation?.objetivo_descripcion && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Objetivo actual
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {latestConsultation.objetivo_descripcion}
              </p>
              {latestConsultation.objetivo_tipo &&
                latestConsultation.objetivo_tipo.length >
                  MAGIC_NUMBERS.ZERO && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {latestConsultation.objetivo_tipo.map((tipo) => (
                      <Badge key={tipo} variant="secondary" className="text-xs">
                        {tipo}
                      </Badge>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* ── Gráfica de evolución ── */}
        {chartData.length > MAGIC_NUMBERS.ZERO ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              Evolución
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Calorías objetivo y peso registrados por consulta
            </p>
            <ChartContainer
              config={chartConfig}
              className="max-h-[220px] w-full"
            >
              <ComposedChart data={chartData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  tickMargin={8}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  yAxisId="kcal"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  width={45}
                  tickFormatter={(v) => `${v}`}
                />
                <YAxis
                  yAxisId="kg"
                  orientation="right"
                  domain={["dataMin - 2", "dataMax + 2"]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  width={40}
                  tickFormatter={(v) => `${v} kg`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  yAxisId="kcal"
                  dataKey="calorias"
                  fill="var(--color-calorias)"
                  radius={4}
                />
                <Line
                  yAxisId="kg"
                  dataKey="peso"
                  type="monotone"
                  stroke="var(--color-peso)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--color-peso)" }}
                  connectNulls
                />
              </ComposedChart>
            </ChartContainer>
          </div>
        ) : null}

        {/* ── Raciones y comparación de dietas ── */}
        <PortionsChart patientId={patientId} consultations={consultations} />
        <DietComparison consultations={consultations} />

        {/* ── Historial de consultas ── */}
        {consultations.length > MAGIC_NUMBERS.ZERO && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Historial de consultas
              </h2>
            </div>
            <ScrollArea className="h-[420px]">
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {[...consultations].reverse().map((consultation, idx) => {
                  const hasDiet = !!consultation.diet_md;
                  const consultationNumber = consultations.length - idx;

                  return (
                    <div
                      key={consultation.id}
                      className="px-6 py-4 flex items-start gap-4"
                    >
                      {/* Nº consulta */}
                      <div className="shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                          {consultationNumber}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatDate(consultation.created_at)}
                          </span>
                          {consultation.objetivo_calorias && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              · {consultation.objetivo_calorias} kcal
                            </span>
                          )}
                          {hasDiet ? (
                            <Badge
                              variant="outline"
                              className="text-xs text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-900/20"
                            >
                              <CheckCircle2Icon className="h-3 w-3 mr-1" />
                              Dieta generada
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs text-gray-500 border-gray-200 dark:border-gray-600"
                            >
                              <ClockIcon className="h-3 w-3 mr-1" />
                              Sin dieta
                            </Badge>
                          )}
                        </div>

                        {consultation.objetivo_descripcion && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                            {consultation.objetivo_descripcion}
                          </p>
                        )}

                        {consultation.objetivo_tipo &&
                          consultation.objetivo_tipo.length >
                            MAGIC_NUMBERS.ZERO && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {consultation.objetivo_tipo.map((tipo) => (
                                <Badge
                                  key={tipo}
                                  variant="secondary"
                                  className="text-xs py-0"
                                >
                                  {tipo}
                                </Badge>
                              ))}
                            </div>
                          )}
                      </div>

                      {/* Acción */}
                      <div className="shrink-0">
                        {consultation.documento_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={() =>
                              openDiet(consultation.documento_url as string)
                            }
                          >
                            <FileTextIcon className="h-3 w-3 mr-1" />
                            Ver dieta
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={() =>
                              router.push(
                                `/diets?consultation=${consultation.id}`,
                              )
                            }
                          >
                            <FileTextIcon className="h-3 w-3 mr-1" />
                            Generar dieta
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {consultations.length === MAGIC_NUMBERS.ZERO && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-12 shadow-sm text-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              No hay consultas registradas para este paciente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
