"use server";

import { createClient } from "../../lib/supabase/server";
import { extractPatientData } from "@/services/extraction-service";
import { revalidatePath } from "next/cache";

export async function processConsultation(
  transcription: string,
  existingPatientId?: string,
) {
  try {
    const supabase = await createClient();

    // 1. Extract data using OpenAI
    const { patient, consultation } = await extractPatientData(transcription);

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
      // To do this cleanly, we can filter undefined values from 'patient' object
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

    // 4. Create Consultation Record
    const { error: consultationError } = await supabase
      .from("patient_consultations")
      .insert({
        patient_id: patientId,
        created_by: user.id,
        audio_transcription: transcription,
        ...consultation,
      });

    if (consultationError)
      throw new Error(
        `Error creating consultation: ${consultationError.message}`,
      );

    revalidatePath("/dashboard");
    revalidatePath("/diets");

    return { success: true, patientId };
  } catch (error) {
    console.error("Error processing consultation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
