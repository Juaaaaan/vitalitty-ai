export type PortionGroup =
  | "hidrato_comida"
  | "hidrato_cena"
  | "proteina"
  | "lacteos"
  | "pan"
  | "grasas"
  | "fruta"
  | "verdura"
  | "otros";

export type PortionUnit = "g" | "ml" | "ud";

/** Cantidad base de un grupo en una dieta. Sin rango, `min === max`. */
export interface PortionEntry {
  group: PortionGroup;
  label: string;
  min: number;
  max: number;
  unit: PortionUnit;
  /** Equivalencias y variantes, tal como las pauta el documento. */
  alternatives: string;
}

/** `patient_consultations.diet_portions`: raciones de la dieta de esa fila. */
export interface DietPortions {
  version: number;
  groups: PortionEntry[];
}

/** `patient_consultations.diet_changes`: comparación con la versión anterior. */
export interface DietChanges {
  version: number;
  previousConsultationId: string;
  added: string[];
  removed: string[];
  summary: string;
  createdAt: string;
}

/** De dónde sale el "por qué" del resumen de cambios. */
export type ReasonSource =
  | { kind: "transcription"; text: string }
  | { kind: "summary"; text: string }
  | { kind: "none" };

export interface PortionDelta {
  group: PortionGroup;
  label: string;
  previous: PortionEntry | null;
  current: PortionEntry | null;
  /** null si falta un lado o las unidades no coinciden. */
  delta: { min: number; max: number } | null;
}

export interface ComparisonSide {
  consultationId: string;
  dietVersion: number;
  createdAt: string;
  calories: number | null;
  weight: number | null;
}

/** Respuesta de `POST /api/compare-diets`. */
export interface DietComparison {
  previous: ComparisonSide;
  current: ComparisonSide;
  portions: PortionDelta[];
  added: string[];
  removed: string[];
  summary: string;
}

/** Una fila de `POST /api/diet-portions`. */
export interface DietPortionsRow {
  consultationId: string;
  dietVersion: number;
  createdAt: string;
  portions: DietPortions;
}

export interface DietPortionsResponse {
  portions: DietPortionsRow[];
  failed: string[];
}
