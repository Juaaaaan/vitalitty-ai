import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";
import {
  isKnowledgeDocumentType,
  normalizeTags,
  updateDocumentMetadata,
} from "@/services/brain-service";
import {
  BRAIN_SESSION_EXPIRED_MESSAGE,
  DOCUMENT_NOT_FOUND_MESSAGE,
  INVALID_DOCUMENT_TYPE_MESSAGE,
  SAVE_FAILED_MESSAGE,
} from "@/constants/brain";

type Params = { params: Promise<{ id: string }> };

/**
 * Cambia la metadata del documento: título, tipo, etiquetas, "siempre incluir".
 *
 * No crea versión de contenido, a propósito: el tipo y las etiquetas describen
 * el documento y gobiernan cuándo lo selecciona el retrieval, pero no son el
 * documento. Versionarlas llenaría el histórico de entradas sin cambio de texto.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as {
    titulo?: unknown;
    tipo?: unknown;
    tags?: unknown;
    siempreIncluir?: unknown;
  };

  if (body.tipo !== undefined && !isKnowledgeDocumentType(body.tipo)) {
    return NextResponse.json(
      { error: INVALID_DOCUMENT_TYPE_MESSAGE },
      { status: 400 },
    );
  }

  if (
    body.titulo !== undefined &&
    (typeof body.titulo !== "string" || body.titulo.trim().length === 0)
  ) {
    return NextResponse.json(
      { error: "El título no puede quedarse vacío." },
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

  const result = await updateDocumentMetadata(supabase, {
    documentId: id,
    titulo: typeof body.titulo === "string" ? body.titulo.trim() : undefined,
    tipo: isKnowledgeDocumentType(body.tipo) ? body.tipo : undefined,
    tags: body.tags !== undefined ? normalizeTags(body.tags) : undefined,
    siempreIncluir:
      body.siempreIncluir !== undefined
        ? body.siempreIncluir === true
        : undefined,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { error: DOCUMENT_NOT_FOUND_MESSAGE },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: SAVE_FAILED_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
