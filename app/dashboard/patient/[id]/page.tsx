"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase/client";
import { Patient } from "@/models/dashboard/patients";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftIcon } from "lucide-react";

interface PatientDetailPageProps {
  params: Promise<{ id: string }>;
}

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
        const { data, error } = await supabase
          .from("patients")
          .select("*")
          .eq("id", patientId)
          .single();

        if (error) throw error;

        // Transform gender for display
        if (data) {
          data.gender = data.gender === "M" ? "Masculino" : "Femenino";
        }

        setPatient(data);
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
      <div className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-lg">Cargando información del paciente...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-4"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver al Dashboard
          </Button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-600">
              {error || "No se pudo encontrar el paciente"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
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
          <h1 className="text-3xl font-semibold">Detalle del Paciente</h1>
        </div>

        <Separator className="mb-6" />

        {/* Información del paciente */}
        <div className="bg-white shadow-md rounded-lg p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Información Personal</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">
                  Nombre y Apellidos
                </label>
                <p className="text-lg">{patient.name_surnames}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">
                  Email
                </label>
                <p className="text-lg">{patient.mail || "No especificado"}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">
                  Teléfono
                </label>
                <p className="text-lg">{patient.phone || "No especificado"}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">
                  Edad
                </label>
                <p className="text-lg">
                  {patient.age || "No especificado"} años
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">
                  Género
                </label>
                <p className="text-lg">{patient.gender || "No especificado"}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">
                  Peso
                </label>
                <p className="text-lg">
                  {patient.weight ? `${patient.weight} kg` : "No especificado"}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">
                  Altura
                </label>
                <p className="text-lg">
                  {patient.height ? `${patient.height} cm` : "No especificado"}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="text-xl font-semibold mb-4">
              Historial de Consultas
            </h2>
            <p className="text-gray-500">
              Próximamente: Aquí se mostrarán las consultas anteriores del
              paciente
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
