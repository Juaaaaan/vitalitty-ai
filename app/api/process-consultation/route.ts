import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import {
  extractPatientData,
  generateDietMarkdown,
} from "@/services/extraction-service";

export async function POST(request: NextRequest) {
  try {
    const { transcription, existingPatientId } = await request.json();

    if (!transcription) {
      return NextResponse.json(
        { success: false, error: "Transcription is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // 1. Extraer datos del paciente y generar dieta en paralelo —
    //    son independientes entre sí, así que no tiene sentido hacerlos en serie.
    const [{ patient, consultation }, dietMarkdown] = await Promise.all([
      extractPatientData(transcription),
      generateDietMarkdown(transcription),
    ]);

    // 2. Get current user (nutritionist)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not authenticated" },
        { status: 401 },
      );
    }

    let patientId: string | null = existingPatientId || null;

    // 3. Handle Patient Logic
    if (patientId) {
      // Update existing patient with new data found in audio
      const updates = Object.fromEntries(
        Object.entries(patient).filter(([_, v]) => v != null),
      );

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("patients")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", patientId);
      }
    } else {
      // No explicit patient — try to match by email
      if (patient.mail) {
        const { data: existingPatients } = await supabase
          .from("patients")
          .select("id")
          .eq("mail", patient.mail)
          .limit(1);

        if (existingPatients && existingPatients.length > 0) {
          patientId = existingPatients[0].id;
          await supabase
            .from("patients")
            .update({ ...patient, updated_at: new Date().toISOString() })
            .eq("id", patientId);
        }
      }

      // If still no patientId, create new patient
      if (!patientId) {
        const { data: newPatient, error } = await supabase
          .from("patients")
          .insert({ ...patient, created_by: user.id })
          .select("id")
          .single();

        if (error) {
          return NextResponse.json(
            {
              success: false,
              error: `Error creating patient: ${error.message}`,
            },
            { status: 500 },
          );
        }
        patientId = newPatient.id;
      }
    }

    // 4. Create Consultation Record — incluye el markdown generado
    const { error: consultationError } = await supabase
      .from("patient_consultations")
      .insert({
        ...consultation,
        patient_id: patientId,
        created_by: user.id,
        audio_transcription: transcription,
        diet_md: dietMarkdown, // <-- persistir en BD
      });

    if (consultationError) {
      console.error("Consultation insert error:", consultationError);
      return NextResponse.json(
        {
          success: false,
          error: `Error creating consultation: ${consultationError.message}`,
        },
        { status: 500 },
      );
    }

    // 5. Devolver el markdown al cliente para que pueda mostrarlo y descargarlo
    return NextResponse.json({
      success: true,
      patientId,
      patientName: patient.name_surnames,
      dietMarkdown, // <-- el page.tsx lo usa para el preview y la descarga
    });
  } catch (error) {
    console.error("Error processing consultation:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
