import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import {
  createPromptVersion,
  listPromptVersions,
} from "@/services/brain-service";
import {
  BRAIN_SESSION_EXPIRED_MESSAGE,
  EMPTY_PROMPT_MESSAGE,
  PROMPT_NOT_FOUND_MESSAGE,
  SAVE_FAILED_MESSAGE,
  UNCHANGED_CONTENT_MESSAGE,
} from "@/constants/brain";

type Params = { params: Promise<{ id: string }> };

/** Histórico de versiones de un prompt, de la más nueva a la más antigua. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

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
    const versions = await listPromptVersions(supabase, id);

    // RLS oculta el prompt de otro usuario, así que "no es tuyo" y "no existe"
    // llegan aquí igual: 404 sin contenido, nunca el texto de un prompt ajeno.
    if (!versions) {
      return NextResponse.json(
        { error: PROMPT_NOT_FOUND_MESSAGE },
        { status: 404 },
      );
    }

    return NextResponse.json({ versiones: versions });
  } catch (error) {
    console.error("Error listing prompt versions:", error);
    return NextResponse.json(
      { error: "No se pudo cargar el histórico. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}

/**
 * Crea una versión nueva del prompt. No la activa.
 *
 * Esa separación es el punto de todo el mecanismo: el usuario puede guardar un
 * borrador a medio escribir sin que ninguna generación lo recoja.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { contenido, notaCambio } = (await request.json()) as {
    contenido?: unknown;
    notaCambio?: string | null;
  };

  if (typeof contenido !== "string" || contenido.trim().length === 0) {
    return NextResponse.json({ error: EMPTY_PROMPT_MESSAGE }, { status: 400 });
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

  const result = await createPromptVersion(supabase, {
    promptId: id,
    userId: user.id,
    contenido,
    notaCambio: notaCambio ?? null,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { error: PROMPT_NOT_FOUND_MESSAGE },
        { status: 404 },
      );
    }
    if (result.reason === "unchanged") {
      return NextResponse.json(
        { error: UNCHANGED_CONTENT_MESSAGE },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: SAVE_FAILED_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ version: result.data });
}
