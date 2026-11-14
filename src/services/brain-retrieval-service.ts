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
import {
  normalizeForTagMatch,
  tagMatchesProfile,
} from "@/constants/brain-tag-vocabulary";
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

/**
 * Campos de la ficha contra los que se buscan las etiquetas de los documentos.
 *
 * La ficha entera, no una selección: una etiqueta es específica —`creatina`,
 * `pms`, `gluten`—, así que mirar más texto apenas añade falsos positivos y sí
 * añade sitios donde la consulta pudo mencionarla. La suplementación vive en
 * `suplementos`, la celiaquía en `patologias` o en `alergias_intolerancias`
 * según cómo se dictara, y el objetivo en dos campos distintos.
 */
const PROFILE_FIELDS = CLINICAL_FIELD_LABELS.map(([field]) => field);

/**
 * La ficha del paciente como un solo texto normalizado, para buscar etiquetas
 * dentro.
 *
 * El cruce va en esta dirección y no en la contraria. Antes se construían
 * pseudo-etiquetas con la prosa de la ficha y se le pedía a Postgres que
 * solaparan con las del documento (`tags.ov`), que es igualdad exacta por
 * elemento: la ficha decía "aumentar masa muscular" y el documento
 * `hipertrofia`, así que **no casaba nunca**. Medido contra la base real, de
 * seis documentos entraba solo el de inclusión incondicional, y dos
 * generaciones con fichas distintas dieron el mismo bloque al byte.
 *
 * Una ficha vacía —un paciente nuevo— devuelve la cadena vacía, y entonces solo
 * entran los documentos de inclusión incondicional.
 */
export function profileTextFromMemory(memory: PatientMemory | null): string {
  if (!memory) return "";

  const values: string[] = [];

  for (const field of PROFILE_FIELDS) {
    const value = memory.clinical[field];
    if (value == null) continue;
    values.push(...(Array.isArray(value) ? value : [String(value)]));
  }

  return normalizeForTagMatch(values.join(" · "));
}

/**
 * Las dos queries embeben la versión activa **nombrando la FK**
 * (`!…_version_activa_id_fkey`). No es cosmético: entre cada cabecera y su tabla
 * de versiones hay dos relaciones —la versión apunta a su cabecera, la cabecera
 * a su versión activa—, y un embed sin nombrar la FK lo rechaza PostgREST con
 * `PGRST201`. Ese fallo no se ve en desarrollo: el retrieval no lanza nunca, así
 * que la generación se iba al camino degradado y salía una dieta sin Cerebro.
 *
 * Nombrar esa FK además hace la query uno a uno: llega la versión activa y solo
 * ella, en lugar de todas las versiones del documento con su markdown entero.
 */
type DocumentRow = {
  slug: string;
  titulo: string;
  tags: string[] | null;
  siempre_incluir: boolean;
  documento_versiones: { id: string; contenido_md: string } | null;
};

type PromptRow = {
  prompt_versiones: { id: string; contenido: string } | null;
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
      read(supabase, tipo, profileTextFromMemory(memory)),
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
  profileText: string,
): Promise<{ promptContent: string | null; documents: BrainDocument[] }> {
  const [promptContent, documents] = await Promise.all([
    readActivePrompt(supabase, tipo),
    readDocuments(supabase, profileText),
  ]);

  return { promptContent, documents };
}

async function readActivePrompt(
  supabase: SupabaseClient,
  tipo: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("prompts")
    .select("prompt_versiones!prompts_version_activa_id_fkey(id, contenido)")
    .eq("tipo", tipo);

  if (error)
    throw new Error(`Reading the active prompt failed: ${error.message}`);

  for (const row of (data ?? []) as unknown as PromptRow[]) {
    const active = row.prompt_versiones;
    if (active?.contenido?.trim()) return active.contenido;
  }

  // Un prompt sin versión activa no se usa: es el camino degradado, no un error.
  return null;
}

async function readDocuments(
  supabase: SupabaseClient,
  profileText: string,
): Promise<BrainDocument[]> {
  // Una sola query con la versión activa embebida, y el cruce de etiquetas
  // aquí: `tags.ov` compara elementos enteros, y la ficha no está escrita con
  // el vocabulario del vault. Son los documentos de una nutricionista —media
  // docena, no un corpus—, así que traerlos y filtrar sale más barato que
  // sostener dos queries, y mucho más barato que una llamada al modelo.
  const { data, error } = await supabase
    .from("documentos_conocimiento")
    .select(
      "slug, titulo, tags, siempre_incluir, documento_versiones!documentos_conocimiento_version_activa_id_fkey(id, contenido_md)",
    );

  if (error)
    throw new Error(`Selecting knowledge documents failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as DocumentRow[]).filter(
    (row) =>
      row.siempre_incluir ||
      (row.tags ?? []).some((tag) => tagMatchesProfile(tag, profileText)),
  );

  // Deduplicado por slug —un documento que encaja por tipo y por etiqueta entra
  // una vez— y orden estable: el bloque cacheado tiene que salir igual cada vez.
  const bySlug = new Map<string, BrainDocument>();

  for (const row of rows) {
    const active = row.documento_versiones;
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
