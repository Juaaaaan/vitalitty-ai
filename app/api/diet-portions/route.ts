import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { PATIENT_NOT_FOUND_FOR_PORTIONS_MESSAGE } from "@/constants/diet-comparison";
import type { DietPortionsResponse } from "@/models/diet-comparison/diet-comparison.models";
import { ensurePortions, type DietRow } from "@/services/diet-comparison-store";

// Un paciente con muchas dietas antiguas proyecta varias en la primera
// apertura. Cada una se guarda al terminar, así que un corte no pierde nada.
export const maxDuration = 60;

/**
 * Raciones por grupo de todas las dietas de un paciente, para la gráfica de
 * evolución. Proyecta (una sola vez) las que aún no las tienen.
 *
 * Nunca devuelve `diet_md`: solo las raciones. Si fallan algunas, devuelve las
 * que sí hay y los ids fallidos en `failed`.
 */
export async function POST(request: NextRequest) {
  const { patientId } = (await request.json()) as { patientId?: string };

  if (!patientId) {
    return NextResponse.json(
      { error: "Falta el paciente. Recarga la ficha del paciente." },
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

  // Ajeno o inexistente: el RLS lo oculta y la lectura vuelve vacía.
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json(
      { error: PATIENT_NOT_FOUND_FOR_PORTIONS_MESSAGE },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("patient_consultations")
    .select("id, diet_version, created_at, diet_md, diet_portions")
    .eq("patient_id", patientId)
    .not("diet_md", "is", null)
    .not("diet_version", "is", null)
    .order("diet_version", { ascending: true });

  if (error) {
    console.error("Error loading diets for portions:", error);
    return NextResponse.json(
      {
        error:
          "No se pudieron cargar las dietas del paciente. Recarga la página.",
      },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as DietRow[];
  const failed = await ensurePortions(supabase, rows);

  const body: DietPortionsResponse = {
    portions: rows
      .filter((row) => row.diet_portions)
      .map((row) => ({
        consultationId: row.id,
        dietVersion: row.diet_version,
        createdAt: row.created_at,
        portions: row.diet_portions!,
      })),
    failed,
  };
  return NextResponse.json(body);
}
