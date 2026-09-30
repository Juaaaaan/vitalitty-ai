import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIET_CHANGES_VERSION,
  PORTIONS_CONCURRENCY,
} from "@/constants/diet-comparison";
import type {
  ComparisonSide,
  DietChanges,
  DietComparison,
  DietPortions,
} from "@/models/diet-comparison/diet-comparison.models";
import {
  compareDiets,
  diffPortions,
  needsPortions,
  projectPortions,
  reasonSourceOf,
} from "@/services/diet-comparison-service";

/** Lo mínimo de una fila con dieta para proyectar sus raciones. */
export interface DietRow {
  id: string;
  diet_version: number;
  created_at: string;
  diet_md: string;
  diet_portions: DietPortions | null;
}

/** Ejecuta `task` sobre `items` con, como mucho, `limit` en vuelo a la vez. */
async function forEachWithLimit<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) await task(items[next++]);
    },
  );
  await Promise.all(workers);
}

/**
 * Proyecta las raciones de las filas que no las tienen (o las tienen en un
 * formato antiguo) y guarda cada una en cuanto termina: si la función se corta
 * por `maxDuration`, lo ya hecho queda y la siguiente carga continúa.
 *
 * Muta `rows` con las raciones nuevas y devuelve los ids que fallaron.
 */
export async function ensurePortions(
  supabase: SupabaseClient,
  rows: DietRow[],
): Promise<string[]> {
  const pending = rows.filter((row) => needsPortions(row.diet_portions));
  const failed: string[] = [];

  await forEachWithLimit(pending, PORTIONS_CONCURRENCY, async (row) => {
    try {
      const portions = await projectPortions(row.diet_md);
      const { error } = await supabase
        .from("patient_consultations")
        .update({ diet_portions: portions })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      row.diet_portions = portions;
    } catch (error) {
      console.error(`Portions projection failed for ${row.id}:`, error);
      failed.push(row.id);
    }
  });

  return failed;
}

/** Columnas necesarias para comparar dos versiones de dieta. */
export const COMPARISON_COLUMNS =
  "id, patient_id, diet_version, created_at, diet_md, diet_portions, diet_changes, audio_transcription, consultation_summary, objetivo_calorias, weight";

export interface ComparisonRow extends DietRow {
  patient_id: string;
  diet_changes: DietChanges | null;
  audio_transcription: string | null;
  consultation_summary: string | null;
  objetivo_calorias: number | null;
  weight: number | string | null;
}

/**
 * Por qué no se pudo comparar. El route handler los traduce a estado HTTP y el
 * asistente a una frase; el servicio no conoce ni una cosa ni la otra.
 */
export type ComparisonFailure = "not_found" | "first_diet";

export type ComparisonResult =
  | { ok: true; comparison: DietComparison }
  | { ok: false; failure: ComparisonFailure };

const toNumber = (value: number | string | null) =>
  value == null ? null : Number(value);

function sideOf(row: ComparisonRow): ComparisonSide {
  return {
    consultationId: row.id,
    dietVersion: row.diet_version,
    createdAt: row.created_at,
    calories: toNumber(row.objetivo_calorias),
    weight: toNumber(row.weight),
  };
}

/**
 * Compara la dieta de una consulta (versión N) con la versión anterior del
 * mismo paciente: la existente inmediatamente inferior a N.
 *
 * La comparación se calcula una vez y se guarda en la fila N. Se reutiliza
 * mientras la versión anterior siga siendo la misma consulta; si cambia (se
 * borró), se recalcula. Nunca genera ni modifica ninguna dieta.
 *
 * Vive aquí y no en el route handler porque el asistente compara las mismas
 * dietas: dos sitios decidiendo cuándo recalcular acabarían discrepando, y uno
 * de los dos recalcularía lo que el otro ya había guardado.
 *
 * Una consulta ajena, inexistente o sin dieta devuelve el mismo `not_found`:
 * no se revela si existe. Un fallo del modelo o de la proyección se lanza.
 */
export async function loadComparison(
  supabase: SupabaseClient,
  consultationId: string,
): Promise<ComparisonResult> {
  const { data: currentData } = await supabase
    .from("patient_consultations")
    .select(COMPARISON_COLUMNS)
    .eq("id", consultationId)
    .maybeSingle();
  const current = currentData as ComparisonRow | null;

  if (!current?.diet_md || current.diet_version == null) {
    return { ok: false, failure: "not_found" };
  }

  const { data: previousData } = await supabase
    .from("patient_consultations")
    .select(COMPARISON_COLUMNS)
    .eq("patient_id", current.patient_id)
    .lt("diet_version", current.diet_version)
    .not("diet_md", "is", null)
    .order("diet_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previous = previousData as ComparisonRow | null;

  if (!previous) return { ok: false, failure: "first_diet" };

  const cached = current.diet_changes;
  const changesAreFresh =
    cached != null &&
    cached.version >= DIET_CHANGES_VERSION &&
    cached.previousConsultationId === previous.id;

  const [failed, changes] = await Promise.all([
    ensurePortions(supabase, [previous, current]),
    changesAreFresh
      ? Promise.resolve(cached)
      : compareDiets({
          previousVersion: previous.diet_version,
          currentVersion: current.diet_version,
          previousMd: previous.diet_md,
          currentMd: current.diet_md,
          reason: reasonSourceOf(current),
        }).then(async (result) => {
          const fresh: DietChanges = {
            version: DIET_CHANGES_VERSION,
            previousConsultationId: previous.id,
            ...result,
            createdAt: new Date().toISOString(),
          };
          const { error } = await supabase
            .from("patient_consultations")
            .update({ diet_changes: fresh })
            .eq("id", current.id);
          if (error) throw new Error(error.message);
          return fresh;
        }),
  ]);

  if (failed.length > 0) {
    throw new Error(`Portions projection failed for ${failed.join(", ")}`);
  }

  return {
    ok: true,
    comparison: {
      previous: sideOf(previous),
      current: sideOf(current),
      portions: diffPortions(previous.diet_portions, current.diet_portions),
      added: changes.added,
      removed: changes.removed,
      summary: changes.summary,
    },
  };
}
