import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import {
  createKnowledgeDocument,
  isKnowledgeDocumentType,
  listKnowledgeDocuments,
  normalizeTags,
  slugify,
  validateMarkdownContent,
} from "@/services/brain-service";
import {
  BRAIN_SESSION_EXPIRED_MESSAGE,
  EMPTY_DOCUMENT_MESSAGE,
  INVALID_DOCUMENT_TYPE_MESSAGE,
  ONLY_MARKDOWN_MESSAGE,
  SAVE_FAILED_MESSAGE,
} from "@/constants/brain";

/** Listado de documentos de conocimiento, filtrable por tipo y por etiqueta. */
export async function GET(request: NextRequest) {
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

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const tag = url.searchParams.get("tag");

  if (tipo && !isKnowledgeDocumentType(tipo)) {
    return NextResponse.json(
      { error: INVALID_DOCUMENT_TYPE_MESSAGE },
      { status: 400 },
    );
  }

  try {
    const documentos = await listKnowledgeDocuments(supabase, {
      tipo: tipo && isKnowledgeDocumentType(tipo) ? tipo : null,
      tag: tag?.trim().toLowerCase() || null,
    });

    return NextResponse.json({ documentos });
  } catch (error) {
    console.error("Error listing knowledge documents:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los documentos. Recarga la página." },
      { status: 500 },
    );
  }
}

/**
 * Sube un documento nuevo con su versión 1.
 *
 * El contenido llega como texto, no como fichero: el cliente ya ha rechazado
 * por extensión lo que no es `.md`, y mandar un binario solo para rechazarlo
 * aquí chocaría con el límite de cuerpo de la función. Aun así se revalida —una
 * petición puede llegar sin pasar por el cliente— y no se intenta convertir
 * nada: un PDF se rechaza, no se traduce.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    titulo?: unknown;
    tipo?: unknown;
    tags?: unknown;
    siempreIncluir?: unknown;
    contenidoMd?: unknown;
    nombreFichero?: unknown;
  };

  if (typeof body.titulo !== "string" || body.titulo.trim().length === 0) {
    return NextResponse.json(
      { error: "Pon un título al documento." },
      { status: 400 },
    );
  }

  if (!isKnowledgeDocumentType(body.tipo)) {
    return NextResponse.json(
      { error: INVALID_DOCUMENT_TYPE_MESSAGE },
      { status: 400 },
    );
  }

  // Si el cliente manda el nombre del fichero, la extensión se comprueba también
  // aquí: es la misma regla, revalidada donde no se puede saltar.
  if (
    typeof body.nombreFichero === "string" &&
    body.nombreFichero.length > 0 &&
    !body.nombreFichero.toLowerCase().endsWith(".md")
  ) {
    return NextResponse.json({ error: ONLY_MARKDOWN_MESSAGE }, { status: 400 });
  }

  const content = validateMarkdownContent(body.contenidoMd);
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

  const titulo = body.titulo.trim();
  const slug = slugify(titulo);

  if (slug.length === 0) {
    return NextResponse.json(
      { error: "El título necesita al menos una letra o un número." },
      { status: 400 },
    );
  }

  const result = await createKnowledgeDocument(supabase, {
    userId: user.id,
    slug,
    titulo,
    tipo: body.tipo,
    tags: normalizeTags(body.tags),
    siempreIncluir: body.siempreIncluir === true,
    contenidoMd: content.content,
  });

  if (!result.ok) {
    return NextResponse.json({ error: SAVE_FAILED_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ documento: result.data });
}
