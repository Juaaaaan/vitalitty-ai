import type { DietSectionId } from "@/models/diet-document/diet-document.models";

/**
 * El contrato del documento de dieta, en un solo sitio.
 *
 * Lo comparten tres cosas que se desincronizarían si cada una llevase su copia:
 * el prompt de generación (que lo exige), las dietas de ejemplo (que lo cumplen)
 * y el parser de la plantilla (que lo lee).
 */

/** Campos obligatorios del frontmatter. Sin macros, a propósito. */
export const DIET_FRONTMATTER_FIELDS = [
  "paciente",
  "version",
  "proxima_revision",
  "calorias",
] as const;

/** Secciones del contrato, en el orden en que se maquetan. */
export const DIET_SECTIONS: readonly {
  id: DietSectionId;
  /** Encabezado tal y como lo escribe el generador. */
  heading: string;
}[] = [
  { id: "objetivos", heading: "Objetivos" },
  { id: "suplementacion", heading: "Suplementación" },
  { id: "cantidades", heading: "Cantidades" },
  { id: "entreno", heading: "Pre/Post-entreno" },
  { id: "plan-semanal", heading: "Plan semanal" },
  { id: "observaciones", heading: "Observaciones" },
];

/** Días de la semana reconocidos en los encabezados del plan semanal. */
export const WEEKDAYS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

/** Prefijo que marca un encabezado de turno en lugar de un día. */
export const SHIFT_PREFIX = "turno";

/**
 * Versión de la plantilla de marca.
 *
 * Entra en la huella del PDF guardado, así que subirla invalida todos los PDF
 * de golpe y cada uno se vuelve a renderizar la próxima vez que se pide. Sin
 * esto, arreglar la plantilla no llega a los documentos ya aprobados: su huella
 * solo miraba el markdown, que no ha cambiado.
 *
 * Se sube cuando cambia la maqueta, el parser o cualquier recurso de marca.
 *
 * Historial:
 *   1 — primera versión.
 *   2 — las ingestas dejan de filtrarse por un vocabulario cerrado (los días
 *       salían sin comidas), los subtítulos `###` se maquetan y una línea en
 *       negrita encabeza su texto.
 */
export const DIET_TEMPLATE_VERSION = 2;

/**
 * Plantilla del contrato para el prompt de generación.
 *
 * Vive aquí y no en el servicio de generación porque es el mismo contrato que
 * lee el parser: un cambio debe tocar un solo fichero.
 */
export const DIET_CONTRACT_SPEC = `---
paciente: <nombre y apellidos>
version: <número de versión de la dieta>
proxima_revision: <fecha y hora de la próxima revisión>
calorias: <rango de kcal objetivo>
---

## Objetivos
## Suplementación
## Cantidades
## Pre/Post-entreno
## Plan semanal
### <Día de la semana>[: actividad]   (o "### Turno mañana" / "### Turno tarde")
**COMIDA** / **MERIENDA** / **CENA**
## Observaciones`;
