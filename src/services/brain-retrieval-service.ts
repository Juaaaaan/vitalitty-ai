import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BrainContext,
  BrainDocument,
} from "@/services/diet-generation-service";
import {
  DEFAULT_PROMPTS,
  findDefaultPrompt,
  PROMPT_TYPE_DIET_GENERATION,
} from "@/constants/brain-prompts";
import { CLINICAL_FIELD_LABELS } from "@/constants/patient-memory";
import type { PatientMemory } from "@/models/patient-context/patient-memory.models";

/**
 * Qué entra en contexto antes de generar: el prompt activo del tipo que toca y
 * los documentos de conocimiento que apliquen al paciente.
 *
 * Tres decisiones gobiernan este fichero:
 *
 *   - **es una query, no una llamada al modelo.** La generación ya mide 59,6 s
 *     en el peor caso contra `maxDuration = 60`; decidir la relevancia con otra
 *     llamada se comería el margen que queda y encarecería cada consulta. Se
 *     filtra por metadata (`tipo`, `tags`, "siempre incluir"), no por similitud;
 *   - **el conjunto se congela al arrancar.** Lo que se lee aquí es lo que usa
 *     la generación de principio a fin: activar una versión a mitad no la afecta;
 *   - **nunca lanza.** Si no hay versión activa, la query falla o se agota el
 *     presupuesto, devuelve el prompt por defecto del código y ningún documento.
 *     Una tabla vacía no puede dejar una consulta sin dieta.
 *
 * Corre con el cliente de la sesión, así que RLS —no el prompt— es lo que
 * impide que el conocimiento de un usuario entre en la generación de otro.
 */

/**
 * Margen para el retrieval dentro del presupuesto de la generación.
 *
 * Son dos queries por metadata sobre tablas pequeñas: en condiciones normales
 * responden en decenas de milisegundos. Pasado este tope, la generación sigue
 * con los valores por defecto antes que arriesgar el `maxDuration = 60`.
 */
export const BRAIN_RETRIEVAL_TIMEOUT_MS = 3000;

export type BrainRetrievalResult = {
  brain: BrainContext;
  /** `true` cuando se ha usado el camino degradado: sin Cerebro que leer. */
  degraded: boolean;
  /** Para el log del servidor: por qué se degradó. */
  reason?: "no_active_prompt" | "query_failed" | "timeout";
};

/** Campos de la ficha con los que se cruzan las etiquetas de los documentos. */
const PROFILE_FIELDS = CLINICAL_FIELD_LABELS.map(([field]) => field).filter(
  (field) =>
    field === "patologias" ||
    field === "alergias_intolerancias" ||
    field === "alimentos_evitar" ||
    field === "objetivo_tipo" ||
    field === "actividad_fisica_perfil",
);

/**
 * Etiquetas que describen a este paciente.
 *
 * Normaliza a minúsculas sin acentos y parte por comas y barras, que es como el
 * modelo escribe estos campos ("celiaquía, SOP"). El resultado está ordenado y
 * sin repetidos: la query debe ser la misma para el mismo paciente.
 */
export function profileTagsFromMemory(memory: PatientMemory | null): string[] {
  if (!memory) return [];

  const values: string[] = [];

  for (const field of PROFILE_FIELDS) {
    const value = memory.clinical[field];
    if (value == null) continue;
    values.push(...(Array.isArray(value) ? value : [String(value)]));
  }

  const tags = values
    .flatMap((value) => value.split(/[,/;]+/))
    .map((value) =>
      value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase(),
    )
    .filter((value) => value.length > 2);

  return [...new Set(tags)].sort();
}

type DocumentRow = {
  slug: string;
  titulo: string;
  version_activa_id: string | null;
  documento_versiones: { id: string; contenido_md: string }[] | null;
};

type PromptRow = {
  version_activa_id: string | null;
  prompt_versiones: { id: string; contenido: string }[] | null;
};

/**
 * Lee el Cerebro para esta generación.
 *
 * `tipo` es el del prompt que se necesita; `memory` es la ficha del paciente, o
 * `null` para un paciente nuevo — entonces solo entran los documentos marcados
 * de inclusión incondicional.
 */
export async function loadBrainContext(
  supabase: SupabaseClient,
  {
    tipo = PROMPT_TYPE_DIET_GENERATION,
    memory = null,
    timeoutMs = BRAIN_RETRIEVAL_TIMEOUT_MS,
  }: {
    tipo?: string;
    memory?: PatientMemory | null;
    timeoutMs?: number;
  } = {},
): Promise<BrainRetrievalResult> {
  const fallback = fallbackContext(tipo);

  try {
    const result = await withTimeout(
      read(supabase, tipo, profileTagsFromMemory(memory)),
      timeoutMs,
    );

    if (result === TIMED_OUT) {
      console.warn(
        `Brain retrieval timed out after ${timeoutMs}ms: generating with the code defaults.`,
      );
      return { ...fallback, reason: "timeout" };
    }

    if (!result.promptContent) {
      console.warn(
        `No active prompt for "${tipo}": generating with the code defaults.`,
      );
      return {
        brain: { ...fallback.brain, documents: result.documents },
        degraded: true,
        reason: "no_active_prompt",
      };
    }

    return {
      brain: {
        promptContent: result.promptContent,
        documents: result.documents,
      },
      degraded: false,
    };
  } catch (error) {
    // Un fallo aquí no puede tumbar una consulta ya grabada: la nutricionista
    // tiene al paciente delante y el audio no se vuelve a repetir.
    console.error("Brain retrieval failed, using the code defaults:", error);
    return { ...fallback, reason: "query_failed" };
  }
}

async function read(
  supabase: SupabaseClient,
  tipo: string,
  profileTags: string[],
): Promise<{ promptContent: string | null; documents: BrainDocument[] }> {
  const [promptContent, documents] = await Promise.all([
    readActivePrompt(supabase, tipo),
    readDocuments(supabase, profileTags),
  ]);

  return { promptContent, documents };
}

async function readActivePrompt(
  supabase: SupabaseClient,
  tipo: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("prompts")
    .select("version_activa_id, prompt_versiones(id, contenido)")
    .eq("tipo", tipo);

  if (error)
    throw new Error(`Reading the active prompt failed: ${error.message}`);

  for (const row of (data ?? []) as unknown as PromptRow[]) {
    const active = (row.prompt_versiones ?? []).find(
      (version) => version.id === row.version_activa_id,
    );
    if (active?.contenido?.trim()) return active.contenido;
  }

  // Un prompt sin versión activa no se usa: es el camino degradado, no un error.
  return null;
}

async function readDocuments(
  supabase: SupabaseClient,
  profileTags: string[],
): Promise<BrainDocument[]> {
  // Una sola query con la versión activa embebida. El filtro es metadata:
  // "siempre incluir" o etiqueta que solape con el perfil del paciente.
  let query = supabase
    .from("documentos_conocimiento")
    .select(
      "slug, titulo, version_activa_id, documento_versiones(id, contenido_md)",
    );

  query =
    profileTags.length > 0
      ? query.or(
          `siempre_incluir.eq.true,tags.ov.{${profileTags
            .map((tag) => `"${tag}"`)
            .join(",")}}`,
        )
      : query.eq("siempre_incluir", true);

  const { data, error } = await query;

  if (error)
    throw new Error(`Selecting knowledge documents failed: ${error.message}`);

  const rows = (data ?? []) as unknown as DocumentRow[];

  // Deduplicado por slug —un documento que encaja por tipo y por etiqueta entra
  // una vez— y orden estable: el bloque cacheado tiene que salir igual cada vez.
  const bySlug = new Map<string, BrainDocument>();

  for (const row of rows) {
    const active = (row.documento_versiones ?? []).find(
      (version) => version.id === row.version_activa_id,
    );
    // Sin versión activa no entra, aunque su metadata encaje.
    if (!active?.contenido_md?.trim()) continue;
    if (bySlug.has(row.slug)) continue;

    bySlug.set(row.slug, {
      titulo: row.titulo,
      contenidoMd: active.contenido_md,
    });
  }

  return [...bySlug.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, document]) => document);
}

function fallbackContext(tipo: string): BrainRetrievalResult {
  const prompt = findDefaultPrompt(tipo) ?? DEFAULT_PROMPTS[0];

  return {
    brain: { promptContent: prompt?.contenido ?? "", documents: [] },
    degraded: true,
  };
}

const TIMED_OUT = Symbol("brain-retrieval-timeout");

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
