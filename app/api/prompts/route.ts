import { NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { listPrompts } from "@/services/brain-service";
import { BRAIN_SESSION_EXPIRED_MESSAGE } from "@/constants/brain";

/**
 * Lista los prompts del usuario con su versión activa.
 *
 * RLS es lo que acota el listado a los suyos: no hay filtro por usuario aquí
 * porque la política de la tabla ya lo aplica, y duplicarlo daría la falsa
 * impresión de que la seguridad vive en el route handler.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: BRAIN_SESSION_EXPIRED_MESSAGE },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json({ prompts: await listPrompts(supabase) });
  } catch (error) {
    console.error("Error listing prompts:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los prompts. Recarga la página." },
      { status: 500 },
    );
  }
}
