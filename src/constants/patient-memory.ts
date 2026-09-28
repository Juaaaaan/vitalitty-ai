import type { ClinicalField } from "@/models/patient-context/patient-memory.models";

/** Resúmenes de consultas anteriores que entran en el prompt. Seleccionar, no volcar. */
export const PATIENT_MEMORY_SUMMARY_LIMIT = 3;

/**
 * Campos de la ficha, en el orden en que se muestran al modelo. El orden es
 * fijo para que el mismo paciente produzca siempre el mismo texto.
 */
export const CLINICAL_FIELD_LABELS: ReadonlyArray<[ClinicalField, string]> = [
  ["alergias_intolerancias", "Alergias e intolerancias"],
  ["patologias", "Patologías"],
  ["medicacion", "Medicación"],
  ["cirugias", "Cirugías"],
  ["suplementos", "Suplementación"],
  ["alimentos_evitar", "Alimentos a evitar"],
  ["alimentos_priorizar", "Alimentos a priorizar"],
  ["gustos_preferencias", "Gustos y preferencias"],
  ["objetivo_tipo", "Tipo de objetivo"],
  ["objetivo_descripcion", "Objetivo"],
  ["objetivo_calorias", "Objetivo calórico (kcal)"],
  ["actividad_fisica_perfil", "Perfil de actividad"],
];

/** Mensajes que ve el usuario. Dicen qué hacer, no solo qué falló. */
export const PATIENT_NOT_FOUND_MESSAGE =
  "El paciente elegido no existe o no tienes acceso. Recarga la página y vuelve a elegirlo.";

export const NEW_PATIENT_WITHOUT_NAME_MESSAGE =
  "No se ha podido identificar el nombre del paciente en el audio. Graba de nuevo diciendo su nombre completo o elige un paciente existente.";

export const CHOOSE_PATIENT_TO_RECORD_MESSAGE =
  "Elige un paciente de la lista para empezar a grabar";
