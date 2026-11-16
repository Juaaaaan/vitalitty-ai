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

/**
 * Choque de identidad: el email dictado ya es de otro paciente.
 *
 * Los tres mensajes de salida nombran el error, no la operación: el usuario
 * sabe cuál de los tres cometió, no si eso implica crear o actualizar una ficha.
 */
export const UNSAVED_DIET_WARNING_MESSAGE =
  "Esta dieta todavía no está guardada. Resuelve a quién pertenece sin cerrar la pantalla: si la cierras, habrá que volver a dictarla.";

export const IDENTITY_CONFLICT_TITLE_MESSAGE =
  "Ese correo ya es de otro paciente";

export const IDENTITY_CONFLICT_EXPLANATION_MESSAGE =
  "Un correo identifica a una persona, así que algo no cuadra. Compara los datos y dinos qué ocurrió.";

export const SAME_PATIENT_RESOLUTION_MESSAGE =
  "Es el mismo paciente: guarda la consulta en su ficha";

export const WRONG_MAIL_RESOLUTION_MESSAGE =
  "El correo se dictó mal: crea el paciente nuevo sin correo";

export const STALE_RECORD_RESOLUTION_MESSAGE =
  "La ficha guardada está mal: actualízala con lo dictado hoy";

export const IDENTITY_RESOLUTION_FAILED_MESSAGE =
  "No se ha podido guardar la consulta. La dieta sigue en pantalla: vuelve a intentarlo.";

export const UNKNOWN_RESOLUTION_MESSAGE =
  "Esa forma de resolver el conflicto no existe. Recarga la página y vuelve a elegir.";

export const EMPTY_DIET_MESSAGE =
  "No hay dieta que guardar. Vuelve a generarla antes de resolver el conflicto.";
