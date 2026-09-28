import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

/** Validez de la URL firmada que se devuelve para abrir el fichero recién subido. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Sube el markdown de la dieta al bucket "diets" y enlaza el fichero a la consulta.
 *
 * El bucket es privado: son datos de salud. Los ficheros viven bajo
 * `{user_id}/{patient_id}/{consultation_id}.md` y las políticas de Storage solo
 * dejan a cada usuario tocar su propia carpeta, igual que el RLS de las tablas.
 * `documento_url` guarda esa ruta, no una URL: el enlace se firma al abrirlo.
 *
 * Es el paso manual que sigue a la generación: la consulta ya existe (se guardó
 * al cerrar el stream de /api/process-consultation) y aquí solo se añade el
 * fichero en Storage. El cliente lee `success` y `error` del cuerpo, así que
 * todas las respuestas los llevan, también las de error.
 */
export async function POST(request: NextRequest) {
  const { consultationId, patientId, dietMd } = await request.json();

  if (!consultationId || !patientId || !dietMd) {
    return NextResponse.json(
      {
        success: false,
        error: "consultationId, patientId and dietMd are required",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not authenticated" },
      { status: 401 },
    );
  }

  // Comprobar antes de subir: una consulta ajena o inexistente dejaría un
  // fichero huérfano (el RLS haría que el update no afectase a ninguna fila).
  const { data: consultation } = await supabase
    .from("patient_consultations")
    .select("id")
    .eq("id", consultationId)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (!consultation) {
    return NextResponse.json(
      { success: false, error: "Consultation not found" },
      { status: 404 },
    );
  }

  const filePath = `${user.id}/${patientId}/${consultationId}.md`;

  const { error: uploadError } = await supabase.storage
    .from("diets")
    .upload(filePath, new TextEncoder().encode(dietMd), {
      contentType: "text/markdown",
      upsert: true, // Sobreescribe si ya existe una versión anterior
    });

  if (uploadError) {
    console.error("Error uploading diet:", uploadError);
    return NextResponse.json(
      {
        success: false,
        error: `Error al subir el fichero: ${uploadError.message}`,
      },
      { status: 500 },
    );
  }

  const { error: updateError } = await supabase
    .from("patient_consultations")
    .update({ documento_url: filePath, diet_md: dietMd })
    .eq("id", consultationId);

  if (updateError) {
    console.error("Error saving diet URL:", updateError);
    return NextResponse.json(
      {
        success: false,
        error: `Error al guardar la URL en base de datos: ${updateError.message}`,
      },
      { status: 500 },
    );
  }

  revalidatePath(`/dashboard/patient/${patientId}`);

  const { data: signed, error: signError } = await supabase.storage
    .from("diets")
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    // El fichero ya está subido y enlazado: solo falla el enlace de vista previa.
    console.error("Error signing diet URL:", signError);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true, url: signed.signedUrl });
}
