import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import {
  createDocumentVersion,
  listDocumentVersions,
  validateMarkdownContent,
} from "@/services/brain-service";
import {
  BRAIN_SESSION_EXPIRED_MESSAGE,
  DOCUMENT_NOT_FOUND_MESSAGE,
  EMPTY_DOCUMENT_MESSAGE,
  ONLY_MARKDOWN_MESSAGE,
  SAVE_FAILED_MESSAGE,
  UNCHANGED_CONTENT_MESSAGE,
} from "@/constants/brain";

type Params = { params: Promise<{ id: string }> };

/** Histórico de versiones de un documento, de la más nueva a la más antigua. */
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
    const versions = await listDocumentVersions(supabase, id);

    if (!versions) {
      return NextResponse.json(
        { error: DOCUMENT_NOT_FOUND_MESSAGE },
        { status: 404 },
      );
    }

    return NextResponse.json({ versiones: versions });
  } catch (error) {
    console.error("Error listing document versions:", error);
    return NextResponse.json(
      { error: "No se pudo cargar el histórico. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}

/**
 * Crea una versión nueva del documento. No la activa.
 *
 * Misma mecánica que los prompts, y la misma validación de markdown que en la
 * subida: el documento sigue teniendo que ser markdown cuando se corrige.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { contenidoMd, notaCambio } = (await request.json()) as {
    contenidoMd?: unknown;
    notaCambio?: string | null;
  };

  const content = validateMarkdownContent(contenidoMd);
  if (!content.ok) {
    return NextResponse.json(
      {
        error:
          content.reason === "empty"
            ? EMPTY_DOCUMENT_MESSAGE
            : ONLY_MARKDOWN_MESSAGE,
      },
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

  const result = await createDocumentVersion(supabase, {
    documentId: id,
    userId: user.id,
    contenidoMd: content.content,
    notaCambio: notaCambio ?? null,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { error: DOCUMENT_NOT_FOUND_MESSAGE },
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
