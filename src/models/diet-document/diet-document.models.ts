/**
 * Contrato del documento de dieta.
 *
 * El markdown es la fuente de verdad; estos tipos son la forma en que la
 * plantilla lo lee. No son una extracción a JSON de la que se reconstruya la
 * dieta: el texto de cada sección se conserva tal cual y solo se reordena para
 * maquetarlo.
 *
 * Un documento conforme empieza por un frontmatter con `paciente`, `version`,
 * `proxima_revision` y `calorias`, y sigue con un conjunto cerrado de secciones.
 * Lo que no encaja se descarta para la maqueta en vez de recibir un diseño
 * inventado, y un documento sin frontmatter se presenta en crudo.
 */

/** Frontmatter obligatorio. Sin macros: la dieta prescribe raciones, no gramos de macronutriente. */
export interface DietFrontmatter {
  paciente: string;
  version: string;
  proxima_revision: string;
  calorias: string;
}

/** Identificador de cada sección del contrato, en el orden en que se maquetan. */
export type DietSectionId =
  | "objetivos"
  | "suplementacion"
  | "cantidades"
  | "entreno"
  | "plan-semanal"
  | "observaciones";

/** Una comida dentro de un día o turno. */
export interface DietMeal {
  /** `COMIDA`, `MERIENDA`, `CENA`… tal y como aparece en el documento. */
  label: string;
  /** Texto de la comida, sin marcas de markdown de bloque. */
  body: string;
}

/** Un día de la semana o un turno del plan semanal. */
export interface DietDay {
  /** Encabezado completo: `Lunes: actividad`, `Turno mañana`… */
  heading: string;
  /** Nombre del día o del turno, sin la anotación posterior a los dos puntos. */
  name: string;
  /** Anotación tras los dos puntos, si la hay: `actividad`. */
  note: string | null;
  /** `day` cuando el encabezado nombra un día de la semana, `shift` cuando nombra un turno. */
  kind: "day" | "shift";
  meals: DietMeal[];
}

/** Sección de texto libre: se conserva su markdown y se maqueta según su id. */
export interface DietProseSection {
  id: Exclude<DietSectionId, "plan-semanal">;
  heading: string;
  markdown: string;
}

/** Documento conforme al contrato. */
export interface StructuredDietDocument {
  kind: "structured";
  frontmatter: DietFrontmatter;
  /** Secciones de prosa presentes, en el orden del contrato. */
  sections: DietProseSection[];
  /** Encabezado literal del plan semanal, si está presente. */
  weeklyPlanHeading: string | null;
  /** Días o turnos del plan semanal. Vacío si la sección no está. */
  days: DietDay[];
}

/**
 * Documento que no sigue el contrato: se muestra su markdown sin plantilla y no
 * se puede exportar a PDF. Es el caso de las dietas anteriores a este contrato.
 */
export interface RawDietDocument {
  kind: "raw";
  markdown: string;
  /** Por qué no se pudo estructurar, para el mensaje que ve el usuario. */
  reason: "missing-frontmatter" | "incomplete-frontmatter" | "empty";
}

export type DietDocument = StructuredDietDocument | RawDietDocument;
