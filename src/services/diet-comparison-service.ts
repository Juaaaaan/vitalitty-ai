import anthropic from "../../lib/ai/anthropic";
import { PORTION_GROUPS } from "@/constants/diet-comparison";
import type {
  DietPortions,
  ReasonSource,
} from "@/models/diet-comparison/diet-comparison.models";
import { GROUP_IDS, normalizePortions } from "@/services/diet-portions";

// Las funciones puras viven en `diet-portions` para que el cliente las use
// sin arrastrar el SDK del modelo al navegador.
export {
  diffPortions,
  needsPortions,
  normalizePortions,
} from "@/services/diet-portions";

/**
 * Mismo modelo que la extracción: leer documentos y describir diferencias es
 * trabajo de extracción, no de generación. El modelo de generación no se llama.
 */
export const COMPARISON_MODEL = "claude-haiku-4-5";

const PORTIONS_MAX_TOKENS = 2048;
const CHANGES_MAX_TOKENS = 2048;

const GROUP_GUIDE = PORTION_GROUPS.map(
  ([group, label, description]) => `- ${group} (${label}): ${description}`,
).join("\n");

// Prompts deliberadamente SIN `cache_control`: los system quedan muy por
// debajo del prefijo mínimo cacheable de Haiku (4096 tokens) y los documentos
// de cada llamada son de un solo uso (cada dieta y cada par se proyectan una
// vez y se guardan). Aun así el orden es [system estático] → [documentos], el
// único en el que un corte de caché podría servir.
export const PORTIONS_SYSTEM_PROMPT = `Extraes de una dieta, escrita en markdown por una nutricionista, las raciones que pauta por grupo de alimento.

## Grupos (usa solo estos identificadores)

${GROUP_GUIDE}

## Reglas

- Como mucho una entrada por grupo.
- La cantidad base de un grupo es la PRIMERA que pauta el documento. Las equivalencias ("o 200 gr de patata") y las variantes ("160 gr de pescado") van como texto en alternatives, no como otra entrada.
- Si la cantidad es un rango ("150-200 ml"), min es el extremo inferior y max el superior. Si es un valor único, min y max son iguales.
- Dos cantidades para alimentos distintos NO son un rango. "140 gr de carne roja y 160 gr de pescado" → min 140, max 140, y "160 gr de pescado" en alternatives. Un rango es solo cuando el documento da dos extremos para lo mismo.
- unit: "g" para gramos, "ml" para mililitros, "ud" para piezas o unidades.
- label: el nombre breve con el que el documento llama a esa ración ("Hidrato en comida", "Frutos secos").
- Si el documento no pauta un grupo, no incluyas entrada para él. Nunca inventes ni estimes cantidades.`;

export const CHANGES_SYSTEM_PROMPT = `Comparas dos versiones consecutivas de la dieta de un mismo paciente y explicas qué ha cambiado y por qué.

## Alimentos que entran y salen

- added: alimentos que aparecen en la dieta nueva y no en la anterior.
- removed: alimentos que aparecen en la anterior y no en la nueva.
- Un mismo alimento escrito de otra forma ("yogur natural" / "yogur natural sin azúcar") NO entra ni sale.
- Nombres breves en minúscula, sin cantidades.
- Solo alimentos y bebidas. La medicación (p. ej. finasteride) no es un alimento: sus cambios van, si acaso, en el resumen.

## Resumen

- Entre 2 y 5 frases, en español, en texto plano sin markdown.
- QUÉ cambió: solo a partir de los dos documentos (cantidades, alimentos, estructura).
- POR QUÉ: solo a partir de lo dicho en la consulta de la dieta nueva. No inventes motivos.
- Si lo dicho en la consulta no explica un cambio, o no hay registro de la consulta, dilo explícitamente: "En la consulta no consta el motivo".`;

const PORTIONS_SCHEMA = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          group: { type: "string", enum: GROUP_IDS },
          label: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          unit: { type: "string", enum: ["g", "ml", "ud"] },
          alternatives: { type: "string" },
        },
        required: ["group", "label", "min", "max", "unit", "alternatives"],
        additionalProperties: false,
      },
    },
  },
  required: ["groups"],
  additionalProperties: false,
} as const;

const CHANGES_SCHEMA = {
  type: "object",
  properties: {
    added: { type: "array", items: { type: "string" } },
    removed: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["added", "removed", "summary"],
  additionalProperties: false,
} as const;

/** Exportados para que los tests comprueben que no tienen uniones de tipos. */
export const COMPARISON_SCHEMAS = { PORTIONS_SCHEMA, CHANGES_SCHEMA };

async function requestJson(
  system: string,
  content: string,
  schema: { [key: string]: unknown },
  maxTokens: number,
): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: COMPARISON_MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("La comparación no devolvió contenido de texto");
  }
  return JSON.parse(textBlock.text);
}

/** Raciones por grupo de una dieta. Una llamada al modelo; el resultado se guarda. */
export async function projectPortions(dietMd: string): Promise<DietPortions> {
  const raw = await requestJson(
    PORTIONS_SYSTEM_PROMPT,
    dietMd,
    PORTIONS_SCHEMA,
    PORTIONS_MAX_TOKENS,
  );
  return normalizePortions(raw);
}

export interface ChangesInput {
  previousVersion: number;
  currentVersion: number;
  previousMd: string;
  currentMd: string;
  reason: ReasonSource;
}

/** Contenido del mensaje de usuario para la comparación. Exportado para tests. */
export function buildChangesContent({
  previousVersion,
  currentVersion,
  previousMd,
  currentMd,
  reason,
}: ChangesInput): string {
  const reasonBlock =
    reason.kind === "transcription"
      ? `## Transcripción de la consulta de la dieta nueva\n\n${reason.text}`
      : reason.kind === "summary"
        ? `## Resumen de la consulta de la dieta nueva (no hay transcripción)\n\n${reason.text}`
        : "## Consulta de la dieta nueva\n\nNo hay registro de lo dicho en la consulta: el motivo de los cambios no consta.";

  return [
    `## Dieta anterior (versión ${previousVersion})\n\n${previousMd}`,
    `## Dieta nueva (versión ${currentVersion})\n\n${currentMd}`,
    reasonBlock,
  ].join("\n\n---\n\n");
}

const cleanList = (items: unknown) =>
  Array.isArray(items)
    ? [
        ...new Set(
          items
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ]
    : [];

/** Alimentos que entran y salen y el resumen de qué cambió y por qué. */
export async function compareDiets(input: ChangesInput) {
  const raw = (await requestJson(
    CHANGES_SYSTEM_PROMPT,
    buildChangesContent(input),
    CHANGES_SCHEMA,
    CHANGES_MAX_TOKENS,
  )) as { added?: unknown; removed?: unknown; summary?: unknown };

  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  if (!summary) throw new Error("La comparación no devolvió resumen");

  return {
    added: cleanList(raw.added),
    removed: cleanList(raw.removed),
    summary,
  };
}

/** Transcripción de N, con el resumen como respaldo y aviso si no hay nada. */
export function reasonSourceOf(row: {
  audio_transcription?: string | null;
  consultation_summary?: string | null;
}): ReasonSource {
  if (row.audio_transcription?.trim()) {
    return { kind: "transcription", text: row.audio_transcription.trim() };
  }
  if (row.consultation_summary?.trim()) {
    return { kind: "summary", text: row.consultation_summary.trim() };
  }
  return { kind: "none" };
}
