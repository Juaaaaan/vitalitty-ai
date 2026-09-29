import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "../../../lib/supabase/server";
import { DIET_TEMPLATE_VERSION } from "@/constants/diet-pdf/diet-contract";
import {
  UnstructuredDietError,
  renderDietPdf,
} from "@/services/diet-pdf-service";

/**
 * Entrega el PDF de una consulta, renderizándolo solo cuando hace falta.
 *
 * El PDF es una caché del documento, no una pieza independiente: la fila
 * guarda su ruta y la huella del `diet_md` con el que se generó. Mientras la
 * huella coincida se sirve el guardado; en cuanto el documento cambia, se
 * vuelve a renderizar y se sustituye. Así una corrección invalida el PDF sin
 * que nadie tenga que acordarse de borrarlo.
 *
 * Es la única ruta que carga Chromium, de ahí su `maxDuration` propio: paga el
 * arranque en frío del binario además del render.
 */
export const maxDuration = 60;

/** Validez de la URL firmada que se devuelve. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Huella del PDF: el documento **y** la versión de la plantilla.
 *
 * La versión va dentro a propósito. Con solo el markdown, arreglar la maqueta
 * no llegaba a los PDF ya guardados: el documento no había cambiado, así que se
 * seguía sirviendo el fichero viejo. Ocurrió de verdad — un fallo del parser
 * dejaba los días sin comidas y el PDF corregido no se regeneraba.
 */
function hashOf(dietMd: string): string {
  return createHash("sha256")
    .update(`v${DIET_TEMPLATE_VERSION}\n${dietMd}`, "utf8")
    .digest("hex");
}

function formatDate(value: string | null): string {
  if (!value) return "";

  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function POST(request: NextRequest) {
  const { consultationId } = await request.json();

  if (!consultationId) {
    return NextResponse.json(
      { error: "Falta el identificador de la consulta." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Inicia sesión para descargar la dieta." },
      { status: 401 },
    );
  }

  const { data: consultation } = await supabase
    .from("patient_consultations")
    .select("id, patient_id, diet_md, pdf_path, pdf_source_hash, created_at")
    .eq("id", consultationId)
    .maybeSingle();

  if (!consultation?.diet_md) {
    return NextResponse.json(
      { error: "No se encuentra la consulta." },
      { status: 404 },
    );
  }

  const dietMd = consultation.diet_md as string;
  const hash = hashOf(dietMd);
  const storedPath = consultation.pdf_path as string | null;

  let path = storedPath;

  if (!storedPath || consultation.pdf_source_hash !== hash) {
    let pdf: Buffer;

    try {
      pdf = await renderDietPdf(dietMd, {
        fecha: formatDate(consultation.created_at as string | null),
      });
    } catch (error) {
      if (error instanceof UnstructuredDietError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      console.error("Error rendering diet PDF:", error);
      return NextResponse.json(
        { error: "No se pudo generar el PDF. Inténtalo de nuevo." },
        { status: 500 },
      );
    }

    path = `${user.id}/${consultation.patient_id}/${consultationId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("diets")
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Error uploading diet PDF:", uploadError);
      return NextResponse.json(
        { error: "No se pudo guardar el PDF. Inténtalo de nuevo." },
        { status: 500 },
      );
    }

    // Solo después de que el fichero exista: la fila nunca debe apuntar a una
    // ruta que no está en Storage.
    const { error: updateError } = await supabase
      .from("patient_consultations")
      .update({ pdf_path: path, pdf_source_hash: hash })
      .eq("id", consultationId);

    if (updateError) {
      console.error("Error saving diet PDF path:", updateError);
      return NextResponse.json(
        { error: "No se pudo guardar el PDF. Inténtalo de nuevo." },
        { status: 500 },
      );
    }

    revalidatePath(`/dashboard/patient/${consultation.patient_id}`);
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("diets")
    .createSignedUrl(path as string, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    console.error("Error signing diet PDF URL:", signError);
    return NextResponse.json(
      { error: "No se pudo abrir el PDF. Inténtalo de nuevo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}
