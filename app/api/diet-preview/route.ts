import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { parseDietDocument } from "@/services/diet-document-parser";
import { renderDietDocumentHtml } from "@/services/diet-template";

/**
 * Maqueta el documento de una consulta con la plantilla de marca.
 *
 * Devuelve HTML, no PDF: la vista previa es barata y se puede refrescar en cada
 * corrección sin abrir Chromium ni tocar Storage. El PDF solo nace al aprobar.
 *
 * Deliberadamente no importa `puppeteer-core` ni `pdf-lib`, para que esta ruta
 * no arrastre los ~50 MB de Chromium ni pague su arranque en frío.
 *
 * El HTML se devuelve dentro del JSON para que el cliente lo pinte en un
 * iframe aislado: los estilos de la plantilla son los del documento impreso y
 * no deben mezclarse con los de la aplicación.
 */
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
      { error: "Inicia sesión para ver la dieta." },
      { status: 401 },
    );
  }

  // El RLS ya limita la consulta al usuario; se comprueba igualmente para poder
  // responder 404 en lugar de una plantilla vacía.
  const { data: consultation } = await supabase
    .from("patient_consultations")
    .select("id, diet_md")
    .eq("id", consultationId)
    .maybeSingle();

  if (!consultation) {
    return NextResponse.json(
      { error: "No se encuentra la consulta." },
      { status: 404 },
    );
  }

  const dietMd = (consultation.diet_md as string | null) ?? "";
  const document = parseDietDocument(dietMd);

  return NextResponse.json({
    html: renderDietDocumentHtml(dietMd),
    // El cliente lo usa para no ofrecer la descarga de PDF en una dieta que la
    // plantilla no puede maquetar.
    structured: document.kind === "structured",
  });
}
