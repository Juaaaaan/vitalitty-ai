"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase/client";
import { Patient } from "@/models/dashboard/patients";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftIcon } from "lucide-react";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { MAGIC_NUMBERS } from "@/constants/magic-numbers";
import { MONTHS } from "@/constants/months";

interface PatientDetailPageProps {
  params: Promise<{ id: string }>;
}

const patientToGraphBar = (patient: Patient) => {
  return patient?.consultations?.map((consultation) => ({
    month: MONTHS[new Date(consultation.created_at).getMonth() + 1],
    weight: 100,
    height: 100,
  }));
};

const chartConfig = {
  weight: {
    label: "Peso",
    color: "var(--chart-1)",
  },
  height: {
    label: "Altura",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export default function PatientDetailPage({ params }: PatientDetailPageProps) {
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string>("");

  useEffect(() => {
    // Unwrap the params Promise
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
            .eq("patient_id", patientId),
        ]);

        if (patientData.error || consultationsData.error) {
          throw patientData.error || consultationsData.error;
        }

        // Transform gender for display
        if (patientData && patientData.data) {
          patientData.data.gender =
            patientData.data.gender === "M" ? "Masculino" : "Femenino";
        }

        const combinedData = {
          ...patientData.data, // Todos los campos del paciente
          consultations: consultationsData.data || [], // Array de consultas
        };
        setPatient(combinedData);
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

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-lg text-gray-900 dark:text-white">
          Cargando información del paciente...
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

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        {/* Header con botón de volver */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-4"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver al Dashboard
          </Button>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Detalle del Paciente
          </h1>
        </div>

        <Separator className="mb-6 dark:bg-gray-700" />

        {/* TODO - Hacer llamada a backend para obtener los datos del paciente más en detalle. La tabla es (patient_consultations).
        // TODO - Botón de generar dieta. Navegará a la página de diets
        // TODO - Sección para descargar todas las dietas generadas
        // 1. Puede ser en la tabla de dietas*/}

        <section className="my-6">
          <ChartContainer config={chartConfig} className="max-h-[250px] w-full">
            <BarChart accessibilityLayer data={patientToGraphBar(patient) || []}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
              <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
            </BarChart>
          </ChartContainer>
        </section>

        <div className="bg-white shadow-md rounded-lg p-6 space-y-6">
          <div>
            <h3>
              <b>{patient.name_surnames}</b> ha venido a consulta{" "}
              {patient?.consultations?.length}{" "}
              {patient?.consultations?.length === 1 ? "vez" : "veces"}
            </h3>
          </div>
        </div>

        <section className="my-6">
          <ChartContainer config={chartConfig} className="max-h-[250px] w-full">
            <BarChart accessibilityLayer data={patientToGraphBar(patient)}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
              <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
            </BarChart>
          </ChartContainer>
        </section>

        <section className="mt-6">
          <div>
            {patient &&
              patient.consultations &&
              patient.consultations.length > MAGIC_NUMBERS.ZERO && (
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 space-y-6 mt-6">
                  {patient.consultations.map((consultation) => (
                    <div key={consultation.id}>
                      <p className="text-xs font-light text-gray-700 dark:text-gray-300">
                        <b>Objetivo:</b> {consultation.objetivo_descripcion}
                      </p>
                      <p className="text-xs font-light text-gray-700 dark:text-gray-300">
                        <b>Calorías:</b> {consultation.objetivo_calorias} kcal
                      </p>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </section>
      </div>
    </div>
  );
}
