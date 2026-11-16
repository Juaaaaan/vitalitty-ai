import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import {
  isIdentityResolution,
  type IdentityResolution,
} from "@/models/patient-identity/identity-conflict.models";
import type { ExtractionResult } from "@/services/consultation-extraction-service";
import {
  EMPTY_DIET_MESSAGE,
  IDENTITY_RESOLUTION_FAILED_MESSAGE,
  PATIENT_NOT_FOUND_MESSAGE,
  UNKNOWN_RESOLUTION_MESSAGE,
} from "@/constants/patient-memory";

/**
 * Guarda una consulta cuyo email chocó con el de otro paciente, una vez el
 * usuario ha dicho cuál de los tres errores ocurrió.
 *
 * **Esta ruta no sabe generar.** No importa el motor de generación ni nada que
 * lo arrastre, así que un reintento no puede costar otra llamada al modelo: la
 * dieta llega ya hecha desde la pantalla, donde se pintó mientras se generaba.
 * Por eso le basta el presupuesto de tiempo por defecto.
 *
 * No se fía de lo que llega. Que un conflicto se entregara antes no es un
 * permiso: aquí se revalida la salida contra el conjunto cerrado, que haya
 * dieta, y —vía RLS, dentro de la consulta— que el paciente sea del usuario.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    resolution?: unknown;
    dietMd?: unknown;
    transcription?: unknown;
    existingPatientId?: unknown;
    extraction?: ExtractionResult | null;
  } | null;

  if (!body || !isIdentityResolution(body.resolution)) {
    return NextResponse.json(
      { error: UNKNOWN_RESOLUTION_MESSAGE },
      { status: 400 },
    );
  }

  if (typeof body.dietMd !== "string" || body.dietMd.trim().length === 0) {
    return NextResponse.json({ error: EMPTY_DIET_MESSAGE }, { status: 400 });
  }

  if (
    typeof body.existingPatientId !== "string" ||
    body.existingPatientId.length === 0
  ) {
    return NextResponse.json(
      { error: PATIENT_NOT_FOUND_MESSAGE },
      { status: 404 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: PATIENT_NOT_FOUND_MESSAGE },
      { status: 404 },
    );
  }

  // RLS acota a los pacientes propios: el de otra nutricionista no aparece, así
  // que esto comprueba existencia y pertenencia de una vez.
  const { data: existing } = await supabase
    .from("patients")
    .select("id")
    .eq("id", body.existingPatientId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: PATIENT_NOT_FOUND_MESSAGE },
      { status: 404 },
    );
  }

  const patient = body.extraction?.patient ?? null;
  const consultation = body.extraction?.consultation ?? {};
  const resolution = body.resolution as IdentityResolution;

  const patientId = await applyResolution({
    supabase,
    userId: user.id,
    resolution,
    existingPatientId: body.existingPatientId,
    patient,
  });

  if (!patientId) {
    return NextResponse.json(
      { error: IDENTITY_RESOLUTION_FAILED_MESSAGE },
      { status: 500 },
    );
  }

  const { data: record, error } = await supabase
    .from("patient_consultations")
    .insert({
      ...consultation,
      weight: patient?.weight ?? null,
      patient_id: patientId,
      created_by: user.id,
      audio_transcription:
        typeof body.transcription === "string" ? body.transcription : null,
      diet_md: body.dietMd,
    })
    .select("id, diet_version")
    .single();

  if (error || !record) {
    console.error("Resolving the identity conflict failed:", error);
    return NextResponse.json(
      { error: IDENTITY_RESOLUTION_FAILED_MESSAGE },
      { status: 500 },
    );
  }

  return NextResponse.json({
    consultationId: record.id as string,
    patientId,
    dietVersion: (record.diet_version as number | null) ?? null,
  });
}

/**
 * Lleva a cabo lo que el usuario dijo que había pasado, y devuelve el paciente
 * al que se cuelga la consulta — o `null` si no se pudo.
 *
 * Lo que viaja es **cuál de los tres errores fue**, no una lista de operaciones
 * sobre `patients`: un valor cerrado se revalida, una lista de escrituras habría
 * que autorizarla entera.
 */
async function applyResolution({
  supabase,
  userId,
  resolution,
  existingPatientId,
  patient,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  resolution: IdentityResolution;
  existingPatientId: string;
  patient: ExtractionResult["patient"] | null;
}): Promise<string | null> {
  if (resolution === "mismo-paciente") {
    // El usuario pulsó "nuevo" por error: la consulta va a su ficha de siempre
    // y no se crea nadie. Tampoco se toca la ficha: él no ha dicho que esté mal.
    return existingPatientId;
  }

  if (resolution === "datos-guardados-mal") {
    // Solo los valores que el audio sí trae: un campo que no se mencionó no
    // puede borrar uno bueno que ya estaba guardado.
    const updates = Object.fromEntries(
      Object.entries(patient ?? {}).filter(
        ([, value]) => value != null && String(value).trim().length > 0,
      ),
    );

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("patients")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", existingPatientId);

      if (error) {
        console.error("Updating the existing patient failed:", error);
        return null;
      }
    }

    return existingPatientId;
  }

  // "email-mal-dictado": el paciente nuevo es real, lo que estaba mal era el
  // correo. Se crea sin él —un correo equivocado es peor que ninguno— y la
  // ficha que lo ocupaba queda intacta.
  if (!patient?.name_surnames) return null;

  const sinMail = Object.fromEntries(
    Object.entries(patient).filter(([campo]) => campo !== "mail"),
  );

  const { data, error } = await supabase
    .from("patients")
    .insert({ ...sinMail, created_by: userId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Creating the patient without mail failed:", error);
    return null;
  }

  return data.id as string;
}
