import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import {
  COMPARISON_FAILED_MESSAGE,
  CONSULTATION_NOT_FOUND_MESSAGE,
  FIRST_DIET_MESSAGE,
} from "@/constants/diet-comparison";
import { loadComparison } from "@/services/diet-comparison-store";

// En frío son como mucho 3 llamadas en paralelo: raciones de N-1, de N y cambios.
export const maxDuration = 60;

/**
 * Devuelve la comparación de la dieta de una consulta con la versión anterior
 * del mismo paciente. Toda la lógica —qué versión es la anterior, cuándo se
 * reutiliza lo guardado y cuándo se recalcula— vive en el servicio, que el
 * asistente también usa. Aquí solo se traduce a HTTP.
 */
export async function POST(request: NextRequest) {
  const { consultationId } = (await request.json()) as {
    consultationId?: string;
  };

  if (!consultationId) {
    return NextResponse.json(
      { error: "Falta la dieta a comparar. Elige una versión." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  }

  try {
    const result = await loadComparison(supabase, consultationId);

    if (!result.ok) {
      // Ajena, inexistente o sin dieta: misma respuesta, sin revelar si existe.
      return result.failure === "not_found"
        ? NextResponse.json(
            { error: CONSULTATION_NOT_FOUND_MESSAGE },
            { status: 404 },
          )
        : NextResponse.json({ error: FIRST_DIET_MESSAGE }, { status: 409 });
    }

    return NextResponse.json(result.comparison);
  } catch (error) {
    console.error("Diet comparison failed:", error);
    return NextResponse.json(
      { error: COMPARISON_FAILED_MESSAGE },
      { status: 500 },
    );
  }
}
