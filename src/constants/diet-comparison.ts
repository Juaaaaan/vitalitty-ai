import type { PortionGroup } from "@/models/diet-comparison/diet-comparison.models";

/**
 * Versión del formato de `diet_portions`. Subirla (p. ej. al ampliar los
 * grupos) hace que las filas con una versión menor se vuelvan a proyectar en
 * la siguiente apertura.
 */
export const DIET_PORTIONS_VERSION = 1;

/** Versión del formato de `diet_changes`, con el mismo criterio. */
export const DIET_CHANGES_VERSION = 2;

/** Proyecciones de raciones en paralelo como máximo por petición. */
export const PORTIONS_CONCURRENCY = 4;

/**
 * Grupos fijos, en el orden en que se muestran. La descripción va al prompt:
 * es lo que evita que la misma ración caiga en grupos distintos entre versiones.
 */
export const PORTION_GROUPS: ReadonlyArray<
  readonly [PortionGroup, string, string]
> = [
  [
    "hidrato_comida",
    "Hidrato en comida",
    "Ración de hidrato de carbono (arroz, pasta, legumbre, patata…) de la comida del mediodía",
  ],
  [
    "hidrato_cena",
    "Hidrato en cena",
    "Ración de hidrato de carbono de la cena",
  ],
  [
    "proteina",
    "Proteína",
    "Ración de carne, pescado, huevo u otra fuente principal de proteína por comida",
  ],
  ["lacteos", "Lácteos", "Queso fresco, yogur, kéfir, leche, queso batido"],
  ["pan", "Pan", "Pan de tostadas, bocadillos o sándwiches"],
  ["grasas", "Grasas", "Frutos secos, aceite de oliva, aguacate"],
  ["fruta", "Fruta", "Piezas o gramos de fruta"],
  ["verdura", "Verdura", "Verdura, ensalada, cremas y gazpacho de verdura"],
  [
    "otros",
    "Otros",
    "Cualquier otra cantidad pautada que no encaje en los grupos anteriores",
  ],
];

export const PORTION_GROUP_LABELS = Object.fromEntries(
  PORTION_GROUPS.map(([group, label]) => [group, label]),
) as Record<PortionGroup, string>;

export const PORTION_UNIT_LABELS = { g: "g", ml: "ml", ud: "ud" } as const;

// Mensajes que ve el usuario: en español y diciendo qué hacer.
export const FIRST_DIET_MESSAGE =
  "Esta es la primera dieta del paciente: no hay versión anterior con la que compararla.";
export const COMPARISON_FAILED_MESSAGE =
  "No se pudo preparar la comparación. Vuelve a intentarlo en unos segundos.";
export const PORTIONS_FAILED_MESSAGE =
  "No se pudieron preparar las raciones de algunas dietas. Recarga la página para intentarlo de nuevo.";
export const ONLY_ONE_DIET_MESSAGE =
  "Hace falta una segunda dieta para comparar.";
export const CONSULTATION_NOT_FOUND_MESSAGE =
  "No se ha encontrado esa dieta. Recarga la ficha del paciente y elige otra versión.";
export const PATIENT_NOT_FOUND_FOR_PORTIONS_MESSAGE =
  "No se ha encontrado el paciente. Vuelve al listado y ábrelo de nuevo.";
