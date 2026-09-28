import type { Patient } from "@/models/dashboard/patients";
import type { ConsultationData } from "@/models/extraction/extraction.models";

/** Elección explícita del usuario antes de grabar. Nunca se deduce del audio. */
export type PatientMode = "new" | "existing";

/** Campos clínicos y de preferencias que forman la ficha del paciente. */
export type ClinicalField = keyof Pick<
  ConsultationData,
  | "alergias_intolerancias"
  | "patologias"
  | "medicacion"
  | "cirugias"
  | "suplementos"
  | "gustos_preferencias"
  | "alimentos_evitar"
  | "alimentos_priorizar"
  | "objetivo_descripcion"
  | "objetivo_tipo"
  | "objetivo_calorias"
  | "actividad_fisica_perfil"
>;

export type PatientPersonalData = Pick<
  Patient,
  "name_surnames" | "age" | "gender" | "height" | "weight"
>;

/** Fila ligera de consulta: sin `diet_md` ni `audio_transcription`. */
export type ConsultationMemoryRow = Partial<
  Pick<ConsultationData, ClinicalField>
> & {
  created_at: string;
  diet_version: number | null;
  consultation_summary: string | null;
};

export type ConsultationSummary = {
  version: number | null;
  date: string;
  summary: string;
};

/**
 * Memoria persistente del paciente que entra en el prompt de generación.
 * Acotada: ficha + como mucho `PATIENT_MEMORY_SUMMARY_LIMIT` resúmenes +
 * la última dieta. Nunca el histórico completo.
 */
export type PatientMemory = {
  personal: PatientPersonalData;
  /** Último valor conocido de cada campo; los que nunca se registraron no están. */
  clinical: Partial<Record<ClinicalField, string | string[] | number>>;
  /** De la más reciente a la más antigua. */
  summaries: ConsultationSummary[];
  lastDietMd: string | null;
};
