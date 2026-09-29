import type { SupabaseClient } from "@supabase/supabase-js";
import { renderDietPdf } from "@/services/diet-pdf-service";
import { PDF_BUCKET, pdfPathFor, type PdfRow } from "@/services/diet-pdf-cache";

/**
 * Falló Storage o la fila, no el render. Se distingue porque el usuario ve un
 * mensaje distinto: "no se pudo guardar" frente a "no se pudo generar".
 */
export class PdfStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfStorageError";
  }
}

/**
 * Renderiza el PDF de una consulta, lo sube y apunta la fila a él.
 *
 * Separado de `diet-pdf-cache` porque esto es lo único del flujo que necesita
 * Chromium: decidir si el PDF guardado sirve, o firmarlo, se puede hacer sin
 * él, y el bucle del asistente solo hace eso.
 *
 * El orden importa: la fila se actualiza **después** de que el fichero exista
 * en Storage, para que `pdf_path` nunca apunte a una ruta que no está subida.
 *
 * Propaga `UnstructuredDietError` si el documento no sigue el contrato.
 */
export async function renderAndStoreDietPdf(
  supabase: SupabaseClient,
  userId: string,
  row: PdfRow,
  hash: string,
): Promise<string> {
  const pdf = await renderDietPdf(row.diet_md, {
    fecha: row.created_at
      ? new Date(row.created_at).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "",
  });

  const path = pdfPathFor(userId, row.patient_id, row.id);

  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    throw new PdfStorageError(
      `Error uploading diet PDF: ${uploadError.message}`,
    );
  }

  const { error: updateError } = await supabase
    .from("patient_consultations")
    .update({ pdf_path: path, pdf_source_hash: hash })
    .eq("id", row.id);

  if (updateError) {
    throw new PdfStorageError(
      `Error saving diet PDF path: ${updateError.message}`,
    );
  }

  return path;
}
