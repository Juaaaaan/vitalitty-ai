import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "../../../lib/supabase/server";
import { UnstructuredDietError } from "@/services/diet-pdf-service";
import { loadPdfState, signPdf } from "@/services/diet-pdf-cache";
import {
  PdfStorageError,
  renderAndStoreDietPdf,
} from "@/services/diet-pdf-store";

/**
 * Entrega el PDF de una consulta, renderizándolo solo cuando hace falta.
 *
 * El PDF es una caché del documento, no una pieza independiente: la fila
 * guarda su ruta y la huella del `diet_md` con el que se generó. Mientras la
 * huella coincida se sirve el guardado; en cuanto el documento cambia, se
 * vuelve a renderizar y se sustituye. Así una corrección invalida el PDF sin
 * que nadie tenga que acordarse de borrarlo.
 *
 * Decidir si sirve, firmarlo y renderizarlo vive en los servicios, que el
 * asistente también usa; aquí solo se traduce a HTTP.
 *
 * Es la única ruta del flujo de consulta que carga Chromium, de ahí su
 * `maxDuration` propio: paga el arranque en frío del binario además del render.
 */
export const maxDuration = 60;

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

  const state = await loadPdfState(supabase, consultationId);

  if (state.status === "not_found") {
    return NextResponse.json(
      { error: "No se encuentra la consulta." },
      { status: 404 },
    );
  }

  let path: string;

  if (state.status === "fresh") {
    path = state.path;
  } else {
    try {
      path = await renderAndStoreDietPdf(
        supabase,
        user.id,
        state.row,
        state.hash,
      );
    } catch (error) {
      if (error instanceof UnstructuredDietError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      console.error("Error rendering diet PDF:", error);
      return NextResponse.json(
        {
          error:
            error instanceof PdfStorageError
              ? "No se pudo guardar el PDF. Inténtalo de nuevo."
              : "No se pudo generar el PDF. Inténtalo de nuevo.",
        },
        { status: 500 },
      );
    }

    revalidatePath(`/dashboard/patient/${state.row.patient_id}`);
  }

  try {
    return NextResponse.json({ url: await signPdf(supabase, path) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "No se pudo abrir el PDF. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
