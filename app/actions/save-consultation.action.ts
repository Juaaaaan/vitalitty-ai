"use server";

import { createClient } from "../../lib/supabase/server";
import {
  extractPatientData,
  generateDietMarkdown,
} from "@/services/extraction-service";
import { revalidatePath } from "next/cache";

export async function processConsultation(
  transcription: string,
  existingPatientId?: string,
) {
  try {
    const supabase = await createClient();

    // 1. Extraer datos del paciente y consulta + generar dieta en paralelo
    //    Ambas llamadas usan la misma transcripción como entrada y son independientes,
    //    por lo que se pueden ejecutar en paralelo para reducir latencia total.
    const [{ patient, consultation }, dietMarkdown] = await Promise.all([
      extractPatientData(transcription),
      generateDietMarkdown(transcription),
    ]);

    // 2. Get current user (nutritionist)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("User not authenticated");

    let patientId: string | null = existingPatientId || null;

    // 3. Handle Patient Logic
    if (patientId) {
      // Update existing patient with new data found in audio (e.g. updated weight/age)
      // We only update fields that are present (not null/undefined) from extraction
      const updates = Object.fromEntries(
        Object.entries(patient).filter(([_, v]) => v != null),
      );

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("patients")
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq("id", patientId);
      }
    } else {
      // No explicit patient selected, try to match by email if available
      if (patient.mail) {
        const { data: existingPatients } = await supabase
          .from("patients")
          .select("id")
          .eq("mail", patient.mail)
          .limit(1);

        if (existingPatients && existingPatients.length > 0) {
          patientId = existingPatients[0].id;
          // Update existing
          await supabase
            .from("patients")
            .update({
              ...patient,
              updated_at: new Date().toISOString(),
            })
            .eq("id", patientId);
        }
      }

      // If still no patientId, create new
      if (!patientId) {
        const { data: newPatient, error } = await supabase
          .from("patients")
          .insert({
            ...patient,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (error) throw new Error(`Error creating patient: ${error.message}`);
        patientId = newPatient.id;
      }
    }

    // 4. Create Consultation Record — incluye el markdown de la dieta
    const { error: consultationError } = await supabase
      .from("patient_consultations")
      .insert({
        audio_transcription: transcription,
        diet_md: dietMarkdown, // <-- nuevo campo
        ...consultation,
      });

    if (consultationError) {
      console.error(consultationError);
      throw new Error(
        `Error creating consultation: ${consultationError.message}`,
      );
    }

    revalidatePath("/dashboard");

    return { success: true, patientId };
  } catch (error) {
    console.error("Error processing consultation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
