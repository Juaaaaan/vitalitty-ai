import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import {
  COMPARISON_FAILED_MESSAGE,
  CONSULTATION_NOT_FOUND_MESSAGE,
  DIET_CHANGES_VERSION,
  FIRST_DIET_MESSAGE,
} from "@/constants/diet-comparison";
import type {
  ComparisonSide,
  DietChanges,
  DietComparison,
} from "@/models/diet-comparison/diet-comparison.models";
import {
  compareDiets,
  diffPortions,
  reasonSourceOf,
} from "@/services/diet-comparison-service";
import { ensurePortions, type DietRow } from "@/services/diet-comparison-store";

// En frío son como mucho 3 llamadas en paralelo: raciones de N-1, de N y cambios.
export const maxDuration = 60;

const COLUMNS =
  "id, patient_id, diet_version, created_at, diet_md, diet_portions, diet_changes, audio_transcription, consultation_summary, objetivo_calorias, weight";

interface ComparisonRow extends DietRow {
  patient_id: string;
  diet_changes: DietChanges | null;
  audio_transcription: string | null;
  consultation_summary: string | null;
  objetivo_calorias: number | null;
  weight: number | string | null;
}

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
 */
export async function POST(request: NextRequest) {
  const { consultationId } = (await request.json()) as {
    consultationId?: string;
  };

  if (!consultationId) {
    return NextResponse.json(
      { error: "Falta la dieta a comparar. Elige una versión." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  }

  // Ajena, inexistente o sin dieta: misma respuesta, sin revelar si existe.
  const { data: currentData } = await supabase
    .from("patient_consultations")
    .select(COLUMNS)
    .eq("id", consultationId)
    .maybeSingle();
  const current = currentData as ComparisonRow | null;

  if (!current?.diet_md || current.diet_version == null) {
    return NextResponse.json(
      { error: CONSULTATION_NOT_FOUND_MESSAGE },
      { status: 404 },
    );
  }

  const { data: previousData } = await supabase
    .from("patient_consultations")
    .select(COLUMNS)
    .eq("patient_id", current.patient_id)
    .lt("diet_version", current.diet_version)
    .not("diet_md", "is", null)
    .order("diet_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previous = previousData as ComparisonRow | null;

  if (!previous) {
    return NextResponse.json({ error: FIRST_DIET_MESSAGE }, { status: 409 });
  }

  try {
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

    const body: DietComparison = {
      previous: sideOf(previous),
      current: sideOf(current),
      portions: diffPortions(previous.diet_portions, current.diet_portions),
      added: changes.added,
      removed: changes.removed,
      summary: changes.summary,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Diet comparison failed:", error);
    return NextResponse.json(
      { error: COMPARISON_FAILED_MESSAGE },
      { status: 500 },
    );
  }
}
