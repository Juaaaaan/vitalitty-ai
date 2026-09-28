import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { streamDietGeneration } from "@/services/diet-generation-service";
import {
  extractConsultationData,
  type ExtractionResult,
} from "@/services/consultation-extraction-service";

/**
 * Tope de duración de la función. 60 s es el valor admitido en todos los planes
 * de Vercel, así que es el suelo seguro. Una generación de varias páginas puede
 * pasarse: medir cuánto tarda de verdad y subirlo si el plan lo permite.
 */
export const maxDuration = 60;

type StreamEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | {
      type: "done";
      consultationId: string;
      patientId: string;
      patientName: string;
    };

export async function POST(request: NextRequest) {
  const { transcription, existingPatientId } = await request.json();

  if (!transcription) {
    return NextResponse.json(
      { error: "Transcription is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "User not authenticated" },
      { status: 401 },
    );
  }

  // Contexto del paciente y su última dieta, para generar en modo revisión.
  let patientRow = null;
  let previousDietMd: string | null = null;

  if (existingPatientId) {
    const { data } = await supabase
      .from("patients")
      .select("id, name_surnames, age, gender, height, weight")
      .eq("id", existingPatientId)
      .single();
    patientRow = data;

    const { data: lastConsultation } = await supabase
      .from("patient_consultations")
      .select("diet_md")
      .eq("patient_id", existingPatientId)
      .not("diet_md", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    previousDietMd = lastConsultation?.diet_md ?? null;
  }

  // La extracción arranca ya y corre de fondo: el documento no la espera.
  // Solo se recoge al cerrar el stream, justo antes de escribir en base de datos.
  const extractionPromise: Promise<ExtractionResult | null> =
    extractConsultationData(transcription).catch((error) => {
      console.error("Extraction failed:", error);
      return null;
    });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      let dietMarkdown = "";

      try {
        for await (const event of streamDietGeneration({
          transcription,
          patient: patientRow,
          previousDietMd,
        })) {
          if (event.type === "text") {
            dietMarkdown += event.text;
            send({ type: "text", text: event.text });
          } else if (event.type === "thinking") {
            send({ type: "thinking", text: event.text });
          } else {
            console.log("Diet generation usage:", {
              cacheReadInputTokens: event.cacheReadInputTokens,
              cacheCreationInputTokens: event.cacheCreationInputTokens,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
            });
          }
        }

        const extraction = await extractionPromise;
        const { consultationId, patientId, patientName } = await persist({
          supabase,
          userId: user.id,
          transcription,
          dietMarkdown,
          extraction,
          existingPatientId: existingPatientId ?? null,
          fallbackName: patientRow?.name_surnames ?? "",
        });

        send({ type: "done", consultationId, patientId, patientName });
      } catch (error) {
        // La generación falló a mitad: no se escribe una consulta con dieta
        // parcial. El texto ya emitido se queda en pantalla del lado del cliente.
        console.error("Diet generation failed:", error);
        send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "La generación de la dieta falló",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

type PersistArgs = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  transcription: string;
  dietMarkdown: string;
  extraction: ExtractionResult | null;
  existingPatientId: string | null;
  fallbackName: string;
};

/**
 * Escribe paciente y consulta en una sola pasada, al cerrar el stream.
 *
 * Si la extracción falló, `extraction` es null: la consulta se guarda igual con
 * el documento, que es la fuente de verdad, y sin los campos estructurados.
 */
async function persist({
  supabase,
  userId,
  transcription,
  dietMarkdown,
  extraction,
  existingPatientId,
  fallbackName,
}: PersistArgs) {
  const patient = extraction?.patient ?? null;
  const consultation = extraction?.consultation ?? {};

  let patientId = existingPatientId;

  if (patientId) {
    if (patient) {
      const updates = Object.fromEntries(
        Object.entries(patient).filter(([, value]) => value != null),
      );
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("patients")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", patientId);
      }
    }
  } else {
    if (patient?.mail) {
      const { data: matches } = await supabase
        .from("patients")
        .select("id")
        .eq("mail", patient.mail)
        .limit(1);

      if (matches && matches.length > 0) {
        patientId = matches[0].id;
        await supabase
          .from("patients")
          .update({ ...patient, updated_at: new Date().toISOString() })
          .eq("id", patientId);
      }
    }

    if (!patientId) {
      if (!patient) {
        throw new Error(
          "No hay paciente seleccionado y la extracción no devolvió datos para crearlo",
        );
      }
      const { data: newPatient, error } = await supabase
        .from("patients")
        .insert({ ...patient, created_by: userId })
        .select("id")
        .single();

      if (error) throw new Error(`Error creating patient: ${error.message}`);
      patientId = newPatient.id;
    }
  }

  const { data: record, error: consultationError } = await supabase
    .from("patient_consultations")
    .insert({
      ...consultation,
      patient_id: patientId,
      created_by: userId,
      audio_transcription: transcription,
      diet_md: dietMarkdown,
    })
    .select("id")
    .single();

  if (consultationError) {
    throw new Error(
      `Error creating consultation: ${consultationError.message}`,
    );
  }

  return {
    consultationId: record.id as string,
    patientId: patientId as string,
    patientName: patient?.name_surnames || fallbackName,
  };
}
