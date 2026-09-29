import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../../lib/supabase/server";
import {
  ToolInputError,
  ToolNotFoundError,
} from "@/models/assistant/assistant.models";
import { isWriteTool } from "@/services/assistant/catalog";
import { WRITE_TOOLS } from "@/services/assistant/write-tools";

/**
 * Ejecuta una acción que el usuario ha confirmado.
 *
 * Es el ÚNICO sitio donde el asistente escribe, y el único donde genera una
 * dieta o renderiza un PDF. Por eso tiene su propio `maxDuration`: una
 * generación completa ya roza los 60 s y no puede compartir presupuesto con el
 * bucle de herramientas.
 *
 * No se fía de nada de lo que llega: revalida que la herramienta existe y
 * escribe, que los argumentos son válidos y —vía RLS, dentro del ejecutor— que
 * el paciente es del usuario. Que la acción viniera de una propuesta no cuenta
 * como permiso: el cliente podría mandar otra cosa.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { tool, input } = (await request.json()) as {
    tool?: string;
    input?: unknown;
  };

  if (!tool || !isWriteTool(tool) || !WRITE_TOOLS[tool]) {
    return NextResponse.json(
      { error: "Esa acción no se puede confirmar." },
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
    const result = await WRITE_TOOLS[tool](
      { supabase, userId: user.id },
      input,
    );

    // La ficha del paciente muestra las dietas: una versión nueva la cambia.
    if (tool === "generar_dieta") {
      const patientId = (input as { paciente_id?: string })?.paciente_id;
      if (patientId) revalidatePath(`/dashboard/patient/${patientId}`);
    }

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof ToolNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ToolInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`Assistant action ${tool} failed:`, error);
    return NextResponse.json(
      {
        error:
          "No se ha guardado nada: la acción ha fallado. Vuelve a intentarlo.",
      },
      { status: 500 },
    );
  }
}
