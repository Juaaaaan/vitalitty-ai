/** Tipos del Cerebro: prompts y documentos de conocimiento versionados. */

/** Conjunto cerrado, el mismo que el enum de la base de datos. */
export const KNOWLEDGE_DOCUMENT_TYPES = [
  "suplementacion",
  "recetario",
  "paper",
  "protocolo",
  "otro",
] as const;

export type KnowledgeDocumentType = (typeof KNOWLEDGE_DOCUMENT_TYPES)[number];

export function isKnowledgeDocumentType(
  value: unknown,
): value is KnowledgeDocumentType {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

/** Una versión del historial. Inmutable una vez creada. */
export type BrainVersion = {
  id: string;
  version: number;
  notaCambio: string | null;
  createdAt: string;
  /** Marcada como activa en su cabecera. */
  activa: boolean;
};

/** Versión del historial con su contenido, para el editor y el diff. */
export type BrainVersionWithContent = BrainVersion & { contenido: string };

export type PromptSummary = {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  /** `null` cuando el prompt no tiene versión activa: no se usa en generación. */
  versionActiva: {
    id: string;
    version: number;
    activadaEn: string | null;
  } | null;
};

export type KnowledgeDocumentSummary = {
  id: string;
  slug: string;
  titulo: string;
  tipo: KnowledgeDocumentType;
  tags: string[];
  siempreIncluir: boolean;
  versionActiva: {
    id: string;
    version: number;
    activadaEn: string | null;
    /** Tamaño en caracteres: alimenta el aviso del conjunto activo. */
    tamano: number;
  } | null;
};
