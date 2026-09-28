"use server";

import { createClient } from "../../lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function uploadDiet(
  consultationId: string,
  patientId: string,
  dietMd: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    // Convertir el markdown a bytes
    const fileContent = new TextEncoder().encode(dietMd);
    const filePath = `${patientId}/${consultationId}.md`;

    // Subir a Supabase Storage (bucket "diets")
    const { error: uploadError } = await supabase.storage
      .from("diets")
      .upload(filePath, fileContent, {
        contentType: "text/markdown",
        upsert: true, // Sobreescribe si ya existe una versión anterior
      });

    if (uploadError) {
      throw new Error(`Error al subir el fichero: ${uploadError.message}`);
    }

    // Obtener la URL pública
    const {
      data: { publicUrl },
    } = supabase.storage.from("diets").getPublicUrl(filePath);

    // Actualizar la consulta con la URL y el diet_md
    const { error: updateError } = await supabase
      .from("patient_consultations")
      .update({
        documento_url: publicUrl,
        diet_md: dietMd,
      })
      .eq("id", consultationId);

    if (updateError) {
      throw new Error(
        `Error al guardar la URL en base de datos: ${updateError.message}`,
      );
    }

    revalidatePath(`/dashboard/patient/${patientId}`);

    return { success: true, url: publicUrl };
  } catch (error) {
    console.error("Error uploading diet:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
