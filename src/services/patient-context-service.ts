import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLINICAL_FIELD_LABELS,
  PATIENT_MEMORY_SUMMARY_LIMIT,
} from "@/constants/patient-memory";
import type {
  ConsultationMemoryRow,
  PatientMemory,
  PatientPersonalData,
} from "@/models/patient-context/patient-memory.models";

const CLINICAL_FIELDS = CLINICAL_FIELD_LABELS.map(([field]) => field);

/**
 * Columnas ligeras de las consultas. Deliberadamente sin `diet_md` ni
 * `audio_transcription`: solo la última dieta entra en el prompt, y ninguna
 * transcripción anterior.
 */
export const CONSULTATION_MEMORY_COLUMNS = [
  "created_at",
  "diet_version",
  "consultation_summary",
  ...CLINICAL_FIELDS,
].join(", ");

function isKnown(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Convierte las filas de BD en la memoria del paciente. Pura: sin red.
 *
 * `consultations` llega de la más reciente a la más antigua. Para cada campo
 * clínico gana el primer valor conocido en ese orden, así que un dato que la
 * última consulta no repitió se conserva de una anterior.
 */
export function buildPatientMemory(
  personal: PatientPersonalData,
  consultations: ConsultationMemoryRow[],
  lastDietMd: string | null,
): PatientMemory {
  const clinical: PatientMemory["clinical"] = {};
  for (const field of CLINICAL_FIELDS) {
    const row = consultations.find((consultation) =>
      isKnown(consultation[field]),
    );
    if (row) clinical[field] = row[field];
  }

  const summaries = consultations
    .filter((consultation) => consultation.diet_version != null)
    .slice(0, PATIENT_MEMORY_SUMMARY_LIMIT)
    .filter((consultation) => isKnown(consultation.consultation_summary))
    .map((consultation) => ({
      version: consultation.diet_version,
      date: consultation.created_at.slice(0, 10),
      summary: (consultation.consultation_summary as string).trim(),
    }));

  return { personal, clinical, summaries, lastDietMd };
}

/**
 * Carga la memoria de un paciente existente. `null` si el paciente no existe
 * o no es del usuario: RLS lo oculta y la lectura vuelve vacía.
 */
export async function loadPatientMemory(
  supabase: SupabaseClient,
  patientId: string,
): Promise<PatientMemory | null> {
  const [patientResult, consultationsResult, lastDietResult] =
    await Promise.all([
      supabase
        .from("patients")
        .select("name_surnames, age, gender, height, weight")
        .eq("id", patientId)
        .maybeSingle(),
      supabase
        .from("patient_consultations")
        .select(CONSULTATION_MEMORY_COLUMNS)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("patient_consultations")
        .select("diet_md")
        .eq("patient_id", patientId)
        .not("diet_md", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (patientResult.error) throw patientResult.error;
  if (!patientResult.data) return null;
  if (consultationsResult.error) throw consultationsResult.error;

  return buildPatientMemory(
    patientResult.data as PatientPersonalData,
    (consultationsResult.data ?? []) as unknown as ConsultationMemoryRow[],
    (lastDietResult.data?.diet_md as string | undefined) ?? null,
  );
}
