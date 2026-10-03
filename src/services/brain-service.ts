import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isKnowledgeDocumentType,
  type BrainVersion,
  type BrainVersionWithContent,
  type KnowledgeDocumentSummary,
  type KnowledgeDocumentType,
  type PromptSummary,
} from "@/models/brain/brain.models";

/**
 * Escrituras y lecturas del Cerebro.
 *
 * Dos reglas atraviesan todo este fichero:
 *
 *   - guardar no activa. Crear una versión no toca `version_activa_id`, para
 *     que un borrador a medias no pueda cambiar lo que usa una generación;
 *   - una versión creada no se modifica ni se borra. Restaurar es crear otra
 *     con el contenido antiguo, nunca reescribir el historial.
 *
 * Todo corre con el cliente de la sesión, así que el aislamiento entre usuarios
 * lo da RLS y no estas funciones. Aun así se comprueba la pertenencia antes de
 * escribir: con RLS, un update sobre una fila ajena no afecta a ninguna fila y
 * el usuario creería que ha guardado.
 */

type Client = SupabaseClient;

export type BrainWriteResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: "not_found" | "unchanged" | "failed";
      detail?: string;
    };

// Prompts ---------------------------------------------------------------------

type PromptRow = {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  version_activa_id: string | null;
  version_activada_at: string | null;
};

const PROMPT_COLUMNS =
  "id, slug, nombre, tipo, version_activa_id, version_activada_at";

export async function listPrompts(supabase: Client): Promise<PromptSummary[]> {
  const { data, error } = await supabase
    .from("prompts")
    // Sin `!inner`: un prompt todavía sin versiones tiene que aparecer en el
    // listado, señalado como sin versión activa, en lugar de desaparecer.
    .select(`${PROMPT_COLUMNS}, prompt_versiones(id, version)`)
    .order("tipo", { ascending: true })
    .order("slug", { ascending: true });

  if (error) throw new Error(`Error listing prompts: ${error.message}`);

  return (data ?? []).map((row) => {
    const prompt = row as unknown as PromptRow & {
      prompt_versiones: { id: string; version: number }[] | null;
    };
    const active = (prompt.prompt_versiones ?? []).find(
      (version) => version.id === prompt.version_activa_id,
    );

    return {
      id: prompt.id,
      slug: prompt.slug,
      nombre: prompt.nombre,
      tipo: prompt.tipo,
      versionActiva: active
        ? {
            id: active.id,
            version: active.version,
            activadaEn: prompt.version_activada_at,
          }
        : null,
    };
  });
}

export async function listPromptVersions(
  supabase: Client,
  promptId: string,
): Promise<BrainVersionWithContent[] | null> {
  const prompt = await findPrompt(supabase, promptId);
  if (!prompt) return null;

  const { data, error } = await supabase
    .from("prompt_versiones")
    .select("id, version, contenido, nota_cambio, created_at")
    .eq("prompt_id", promptId)
    .order("version", { ascending: false });

  if (error) throw new Error(`Error listing prompt versions: ${error.message}`);

  return (data ?? []).map((row) =>
    toVersionWithContent(row as VersionRow, prompt.version_activa_id),
  );
}

export async function createPromptVersion(
  supabase: Client,
  {
    promptId,
    userId,
    contenido,
    notaCambio,
  }: {
    promptId: string;
    userId: string;
    contenido: string;
    notaCambio?: string | null;
  },
): Promise<BrainWriteResult<BrainVersion>> {
  const prompt = await findPrompt(supabase, promptId);
  if (!prompt) return { ok: false, reason: "not_found" };

  const active = await readActiveContent(
    supabase,
    "prompt_versiones",
    "contenido",
    prompt.version_activa_id,
  );
  if (active === contenido) return { ok: false, reason: "unchanged" };

  const { data, error } = await supabase
    .from("prompt_versiones")
    .insert({
      prompt_id: promptId,
      contenido,
      nota_cambio: notaCambio?.trim() ? notaCambio.trim() : null,
      created_by: userId,
    })
    .select("id, version, nota_cambio, created_at")
    .single();

  if (error) {
    console.error("Error creating prompt version:", error);
    return { ok: false, reason: "failed", detail: error.message };
  }

  // Deliberadamente sin activar: guardar y activar son acciones distintas.
  return { ok: true, data: toVersion(data as VersionRow, null) };
}

export async function activatePromptVersion(
  supabase: Client,
  { promptId, versionId }: { promptId: string; versionId: string },
): Promise<BrainWriteResult<{ version: number; activadaEn: string }>> {
  return activateVersion(supabase, {
    headerTable: "prompts",
    versionsTable: "prompt_versiones",
    parentColumn: "prompt_id",
    headerId: promptId,
    versionId,
  });
}

async function findPrompt(
  supabase: Client,
  promptId: string,
): Promise<PromptRow | null> {
  const { data } = await supabase
    .from("prompts")
    .select(PROMPT_COLUMNS)
    .eq("id", promptId)
    .maybeSingle();

  return (data as PromptRow | null) ?? null;
}

// Knowledge documents ---------------------------------------------------------

type DocumentRow = {
  id: string;
  slug: string;
  titulo: string;
  tipo: KnowledgeDocumentType;
  tags: string[] | null;
  siempre_incluir: boolean;
  version_activa_id: string | null;
  version_activada_at: string | null;
};

const DOCUMENT_COLUMNS =
  "id, slug, titulo, tipo, tags, siempre_incluir, version_activa_id, version_activada_at";

export type DocumentFilters = {
  tipo?: KnowledgeDocumentType | null;
  /** Una etiqueta basta: el filtro es "tiene esta etiqueta". */
  tag?: string | null;
};

export async function listKnowledgeDocuments(
  supabase: Client,
  filters: DocumentFilters = {},
): Promise<KnowledgeDocumentSummary[]> {
  let query = supabase
    .from("documentos_conocimiento")
    .select(
      `${DOCUMENT_COLUMNS}, documento_versiones(id, version, contenido_md)`,
    )
    .order("tipo", { ascending: true })
    .order("slug", { ascending: true });

  if (filters.tipo) query = query.eq("tipo", filters.tipo);
  if (filters.tag) query = query.contains("tags", [filters.tag]);

  const { data, error } = await query;

  if (error) throw new Error(`Error listing documents: ${error.message}`);

  return (data ?? []).map((row) => {
    const document = row as unknown as DocumentRow & {
      documento_versiones: {
        id: string;
        version: number;
        contenido_md: string;
      }[];
    };
    const active = document.documento_versiones?.find(
      (version) => version.id === document.version_activa_id,
    );

    return {
      id: document.id,
      slug: document.slug,
      titulo: document.titulo,
      tipo: document.tipo,
      tags: document.tags ?? [],
      siempreIncluir: document.siempre_incluir,
      versionActiva: active
        ? {
            id: active.id,
            version: active.version,
            activadaEn: document.version_activada_at,
            tamano: active.contenido_md.length,
          }
        : null,
    };
  });
}

export async function createKnowledgeDocument(
  supabase: Client,
  {
    userId,
    slug,
    titulo,
    tipo,
    tags,
    siempreIncluir,
    contenidoMd,
  }: {
    userId: string;
    slug: string;
    titulo: string;
    tipo: KnowledgeDocumentType;
    tags: string[];
    siempreIncluir: boolean;
    contenidoMd: string;
  },
): Promise<BrainWriteResult<{ id: string; version: number }>> {
  const { data: document, error } = await supabase
    .from("documentos_conocimiento")
    .insert({
      slug,
      titulo,
      tipo,
      tags,
      siempre_incluir: siempreIncluir,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating knowledge document:", error);
    return { ok: false, reason: "failed", detail: error.message };
  }

  const documentId = (document as { id: string }).id;

  const { data: version, error: versionError } = await supabase
    .from("documento_versiones")
    .insert({
      documento_id: documentId,
      contenido_md: contenidoMd,
      created_by: userId,
    })
    .select("id, version")
    .single();

  if (versionError) {
    console.error("Error creating document version:", versionError);
    return { ok: false, reason: "failed", detail: versionError.message };
  }

  const created = version as { id: string; version: number };

  // Un documento recién subido se activa con su versión 1: no hay
  // comportamiento anterior al que proteger, y un documento sin versión activa
  // no entra en ninguna generación, así que quedaría inerte y sin explicación.
  const { error: activateError } = await supabase
    .from("documentos_conocimiento")
    .update({
      version_activa_id: created.id,
      version_activada_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (activateError) {
    console.error("Error activating first document version:", activateError);
    return { ok: false, reason: "failed", detail: activateError.message };
  }

  return { ok: true, data: { id: documentId, version: created.version } };
}

export async function listDocumentVersions(
  supabase: Client,
  documentId: string,
): Promise<BrainVersionWithContent[] | null> {
  const document = await findDocument(supabase, documentId);
  if (!document) return null;

  const { data, error } = await supabase
    .from("documento_versiones")
    .select("id, version, contenido_md, nota_cambio, created_at")
    .eq("documento_id", documentId)
    .order("version", { ascending: false });

  if (error)
    throw new Error(`Error listing document versions: ${error.message}`);

  return (data ?? []).map((row) => {
    const version = row as VersionRow & { contenido_md: string };
    return toVersionWithContent(
      { ...version, contenido: version.contenido_md },
      document.version_activa_id,
    );
  });
}

export async function createDocumentVersion(
  supabase: Client,
  {
    documentId,
    userId,
    contenidoMd,
    notaCambio,
  }: {
    documentId: string;
    userId: string;
    contenidoMd: string;
    notaCambio?: string | null;
  },
): Promise<BrainWriteResult<BrainVersion>> {
  const document = await findDocument(supabase, documentId);
  if (!document) return { ok: false, reason: "not_found" };

  const active = await readActiveContent(
    supabase,
    "documento_versiones",
    "contenido_md",
    document.version_activa_id,
  );
  if (active === contenidoMd) return { ok: false, reason: "unchanged" };

  const { data, error } = await supabase
    .from("documento_versiones")
    .insert({
      documento_id: documentId,
      contenido_md: contenidoMd,
      nota_cambio: notaCambio?.trim() ? notaCambio.trim() : null,
      created_by: userId,
    })
    .select("id, version, nota_cambio, created_at")
    .single();

  if (error) {
    console.error("Error creating document version:", error);
    return { ok: false, reason: "failed", detail: error.message };
  }

  return { ok: true, data: toVersion(data as VersionRow, null) };
}

export async function activateDocumentVersion(
  supabase: Client,
  { documentId, versionId }: { documentId: string; versionId: string },
): Promise<BrainWriteResult<{ version: number; activadaEn: string }>> {
  return activateVersion(supabase, {
    headerTable: "documentos_conocimiento",
    versionsTable: "documento_versiones",
    parentColumn: "documento_id",
    headerId: documentId,
    versionId,
  });
}

/**
 * Cambia la metadata de un documento sin crear versión de contenido: el tipo y
 * las etiquetas describen el documento, no son el documento.
 */
export async function updateDocumentMetadata(
  supabase: Client,
  {
    documentId,
    titulo,
    tipo,
    tags,
    siempreIncluir,
  }: {
    documentId: string;
    titulo?: string;
    tipo?: KnowledgeDocumentType;
    tags?: string[];
    siempreIncluir?: boolean;
  },
): Promise<BrainWriteResult<null>> {
  const document = await findDocument(supabase, documentId);
  if (!document) return { ok: false, reason: "not_found" };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (titulo !== undefined) updates.titulo = titulo;
  if (tipo !== undefined) updates.tipo = tipo;
  if (tags !== undefined) updates.tags = tags;
  if (siempreIncluir !== undefined) updates.siempre_incluir = siempreIncluir;

  const { error } = await supabase
    .from("documentos_conocimiento")
    .update(updates)
    .eq("id", documentId);

  if (error) {
    console.error("Error updating document metadata:", error);
    return { ok: false, reason: "failed", detail: error.message };
  }

  return { ok: true, data: null };
}

async function findDocument(
  supabase: Client,
  documentId: string,
): Promise<DocumentRow | null> {
  const { data } = await supabase
    .from("documentos_conocimiento")
    .select(DOCUMENT_COLUMNS)
    .eq("id", documentId)
    .maybeSingle();

  return (data as DocumentRow | null) ?? null;
}

// Shared ----------------------------------------------------------------------

type VersionRow = {
  id: string;
  version: number;
  contenido?: string;
  nota_cambio: string | null;
  created_at: string;
};

function toVersion(row: VersionRow, activeId: string | null): BrainVersion {
  return {
    id: row.id,
    version: row.version,
    notaCambio: row.nota_cambio,
    createdAt: row.created_at,
    activa: activeId != null && row.id === activeId,
  };
}

function toVersionWithContent(
  row: VersionRow,
  activeId: string | null,
): BrainVersionWithContent {
  return { ...toVersion(row, activeId), contenido: row.contenido ?? "" };
}

async function readActiveContent(
  supabase: Client,
  table: string,
  column: string,
  versionId: string | null,
): Promise<string | null> {
  if (!versionId) return null;

  const { data } = await supabase
    .from(table)
    .select(column)
    .eq("id", versionId)
    .maybeSingle();

  const row = data as Record<string, string> | null;
  return row ? (row[column] ?? null) : null;
}

/**
 * Mueve el puntero de versión activa.
 *
 * Comprueba antes que la versión existe y pertenece a esta cabecera: haber sido
 * creada en otro prompt, o por otro usuario, no la hace activable aquí.
 */
async function activateVersion(
  supabase: Client,
  {
    headerTable,
    versionsTable,
    parentColumn,
    headerId,
    versionId,
  }: {
    headerTable: string;
    versionsTable: string;
    parentColumn: string;
    headerId: string;
    versionId: string;
  },
): Promise<BrainWriteResult<{ version: number; activadaEn: string }>> {
  const { data: version } = await supabase
    .from(versionsTable)
    .select(`id, version, ${parentColumn}`)
    .eq("id", versionId)
    .maybeSingle();

  const row = version as (Record<string, unknown> & { version: number }) | null;

  if (!row || row[parentColumn] !== headerId) {
    return { ok: false, reason: "not_found" };
  }

  const activadaEn = new Date().toISOString();

  const { error } = await supabase
    .from(headerTable)
    .update({
      version_activa_id: versionId,
      version_activada_at: activadaEn,
      updated_at: activadaEn,
    })
    .eq("id", headerId);

  if (error) {
    console.error("Error activating version:", error);
    return { ok: false, reason: "failed", detail: error.message };
  }

  return { ok: true, data: { version: row.version, activadaEn } };
}

/**
 * Rechaza lo que no es markdown antes de guardar nada.
 *
 * El cliente ya filtra por extensión, pero una petición puede llegar sin pasar
 * por él. No se intenta ninguna conversión: un PDF o un .docx se rechazan, no
 * se traducen (eso es otro cambio).
 */
export function validateMarkdownContent(
  content: unknown,
):
  | { ok: true; content: string }
  | { ok: false; reason: "empty" | "not_markdown" } {
  if (typeof content !== "string") return { ok: false, reason: "not_markdown" };
  if (content.trim().length === 0) return { ok: false, reason: "empty" };

  // Firmas de los formatos que la gente intenta subir: PDF y los basados en zip
  // (.docx, .odt). Un markdown nunca empieza así.
  if (/^%PDF-/.test(content) || /^PK\x03\x04/.test(content)) {
    return { ok: false, reason: "not_markdown" };
  }

  // Bytes de control y NUL: señal de binario, no de texto.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content)) {
    return { ok: false, reason: "not_markdown" };
  }

  return { ok: true, content };
}

/** Normaliza las etiquetas que llegan del cliente: minúsculas, sin huecos ni repetidas. */
export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];

  const normalized = tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);

  return [...new Set(normalized)].sort();
}

/** Slug estable a partir del título, para no pedírselo al usuario. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export { isKnowledgeDocumentType };
