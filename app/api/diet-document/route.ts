import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "../../../lib/supabase/server";

/**
 * Corrige el documento de una consulta.
 *
 * El markdown es la fuente de verdad de la dieta, así que esto la reescribe
 * entera. No crea consulta nueva ni consume número de versión: es la misma
 * dieta, corregida antes de aprobarla.
 *
 * No toca `pdf_path` ni `pdf_source_hash`. No hace falta: el PDF guardado se
 * reutiliza solo mientras su huella coincide con el `diet_md` actual, así que
 * una corrección lo invalida por construcción. Borrarlo aquí dejaría al
 * usuario sin el PDF anterior mientras decide si aprueba el nuevo texto.
 */
export async function PUT(request: NextRequest) {
  const { consultationId, dietMd } = await request.json();

  if (!consultationId) {
    return NextResponse.json(
      { error: "Falta el identificador de la consulta." },
      { status: 400 },
    );
  }

  if (typeof dietMd !== "string" || dietMd.trim().length === 0) {
    return NextResponse.json(
      { error: "Escribe el contenido de la dieta antes de guardar." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Inicia sesión para editar la dieta." },
      { status: 401 },
    );
  }

  // Se comprueba antes de escribir: con RLS, un update sobre una consulta ajena
  // no afectaría a ninguna fila y el usuario creería que ha guardado.
  const { data: consultation } = await supabase
    .from("patient_consultations")
    .select("id, patient_id")
    .eq("id", consultationId)
    .maybeSingle();

  if (!consultation) {
    return NextResponse.json(
      { error: "No se encuentra la consulta." },
      { status: 404 },
    );
  }

  const { error } = await supabase
    .from("patient_consultations")
    .update({ diet_md: dietMd })
    .eq("id", consultationId);

  if (error) {
    console.error("Error updating diet document:", error);
    return NextResponse.json(
      { error: "No se pudo guardar la dieta. Inténtalo de nuevo." },
      { status: 500 },
    );
  }

  revalidatePath(`/dashboard/patient/${consultation.patient_id}`);

  return NextResponse.json({ success: true });
}
