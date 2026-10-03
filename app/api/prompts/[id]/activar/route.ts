import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { activatePromptVersion } from "@/services/brain-service";
import {
  BRAIN_SESSION_EXPIRED_MESSAGE,
  SAVE_FAILED_MESSAGE,
  VERSION_NOT_FOUND_MESSAGE,
} from "@/constants/brain";

type Params = { params: Promise<{ id: string }> };

/**
 * Marca una versión como activa.
 *
 * Es el único acto que cambia lo que usa la generación, y surte efecto en la
 * siguiente sin desplegar. Mueve el puntero: no reescribe, borra ni reordena el
 * historial, así que volver atrás es activar otra vez la anterior.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { versionId } = (await request.json()) as { versionId?: unknown };

  if (typeof versionId !== "string" || versionId.length === 0) {
    return NextResponse.json(
      { error: "Indica qué versión quieres activar." },
      { status: 400 },
    );
  }

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

  const result = await activatePromptVersion(supabase, {
    promptId: id,
    versionId,
  });

  if (!result.ok) {
    // Una versión de otro prompt, o de otro usuario, no es activable aquí.
    if (result.reason === "not_found") {
      return NextResponse.json(
        { error: VERSION_NOT_FOUND_MESSAGE },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: SAVE_FAILED_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ activada: result.data });
}
