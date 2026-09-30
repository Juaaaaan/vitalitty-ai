import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIET_TEMPLATE_VERSION } from "@/constants/diet-pdf/diet-contract";

/**
 * Estado del PDF de una consulta y firma de su fichero, **sin** cargar el
 * renderizador.
 *
 * Está separado de `diet-pdf-service` a propósito: ahí vive Chromium, y quien
 * solo quiere saber si el PDF guardado sirve —o entregar su enlace— no debe
 * arrastrar el binario. Es el mismo criterio por el que `/api/diet-preview` no
 * importa `puppeteer-core`.
 */

/** Validez de la URL firmada que se devuelve. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const PDF_BUCKET = "diets";

/** Columnas necesarias para decidir si el PDF guardado sigue sirviendo. */
export const PDF_COLUMNS =
  "id, patient_id, diet_version, diet_md, pdf_path, pdf_source_hash, created_at";

export interface PdfRow {
  id: string;
  patient_id: string;
  /** Versión de la dieta dentro del paciente, para etiquetar el enlace. */
  diet_version: number | null;
  diet_md: string;
  pdf_path: string | null;
  pdf_source_hash: string | null;
  created_at: string | null;
}

/**
 * Cómo se presenta un documento de dieta: qué versión es y de cuándo.
 *
 * Viaja junto al enlace firmado para que la pantalla pueda enseñar "Ver dieta
 * v17 · 29 sept 2026" en vez de la URL. La fecha es la de la consulta en que
 * nació esa versión: una corrección del documento no crea versión nueva y la
 * tabla no guarda `updated_at`, así que no hay fecha de modificación que dar.
 */
export interface DietDocumentLink {
  url: string;
  version: number | null;
  /** Fecha de la consulta de esa versión, en ISO corto (YYYY-MM-DD). */
  fecha: string | null;
}

export function documentLink(row: PdfRow, url: string): DietDocumentLink {
  return {
    url,
    version: row.diet_version,
    fecha: row.created_at ? row.created_at.slice(0, 10) : null,
  };
}

/**
 * Huella del PDF: el documento **y** la versión de la plantilla.
 *
 * La versión va dentro a propósito. Con solo el markdown, arreglar la maqueta
 * no llegaba a los PDF ya guardados: el documento no había cambiado, así que se
 * seguía sirviendo el fichero viejo. Ocurrió de verdad — un fallo del parser
 * dejaba los días sin comidas y el PDF corregido no se regeneraba.
 */
export function pdfSourceHash(dietMd: string): string {
  return createHash("sha256")
    .update(`v${DIET_TEMPLATE_VERSION}\n${dietMd}`, "utf8")
    .digest("hex");
}

export type PdfState =
  | { status: "not_found" }
  /** El fichero guardado corresponde al documento actual: se puede firmar. */
  | { status: "fresh"; row: PdfRow; path: string }
  /** No hay PDF, o el documento cambió desde que se hizo: hay que renderizar. */
  | { status: "stale"; row: PdfRow; hash: string };

/**
 * Lee la consulta y dice si su PDF sirve. Una consulta ajena, inexistente o
 * sin documento devuelve `not_found`: la RLS las hace indistinguibles.
 */
export async function loadPdfState(
  supabase: SupabaseClient,
  consultationId: string,
): Promise<PdfState> {
  const { data } = await supabase
    .from("patient_consultations")
    .select(PDF_COLUMNS)
    .eq("id", consultationId)
    .maybeSingle();

  const row = data as PdfRow | null;
  if (!row?.diet_md) return { status: "not_found" };

  const hash = pdfSourceHash(row.diet_md);

  return row.pdf_path && row.pdf_source_hash === hash
    ? { status: "fresh", row, path: row.pdf_path }
    : { status: "stale", row, hash };
}

/**
 * URL firmada del PDF. Nunca `getPublicUrl()`: son datos de salud y el bucket
 * es privado.
 */
export async function signPdf(
  supabase: SupabaseClient,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PDF_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(`Error signing diet PDF URL: ${error?.message ?? "empty"}`);
  }

  return data.signedUrl;
}

/** Ruta del PDF, junto al `.md` de la misma consulta. */
export function pdfPathFor(
  userId: string,
  patientId: string,
  consultationId: string,
): string {
  return `${userId}/${patientId}/${consultationId}.pdf`;
}
