import type { SupabaseClient } from "@supabase/supabase-js";
import { PORTIONS_CONCURRENCY } from "@/constants/diet-comparison";
import type { DietPortions } from "@/models/diet-comparison/diet-comparison.models";
import {
  needsPortions,
  projectPortions,
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
