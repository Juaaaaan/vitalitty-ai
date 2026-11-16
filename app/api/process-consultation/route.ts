import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import {
  buildIdentityConflict,
  normalizeMail,
} from "@/services/patient-identity-service";
import type { PatientIdentityConflict } from "@/models/patient-identity/identity-conflict.models";

import { streamDietGeneration } from "@/services/diet-generation-service";
import {
  extractConsultationData,
  type ExtractionResult,
} from "@/services/consultation-extraction-service";
import { loadPatientMemory } from "@/services/patient-context-service";
import { loadBrainContext } from "@/services/brain-retrieval-service";
import type {
  PatientMemory,
  PatientMode,
} from "@/models/patient-context/patient-memory.models";
import {
  NEW_PATIENT_WITHOUT_NAME_MESSAGE,
  PATIENT_NOT_FOUND_MESSAGE,
} from "@/constants/patient-memory";

/**
 * Tope de duración de la función.
 *
 * **Requiere un plan de Vercel que admita más de 60 s** (Hobby lo limita a 60 y
 * rechaza el despliegue con un valor mayor). Era el suelo seguro de todos los
 * planes, y dejó de bastar: medida en local el 2026-11-14, una generación con el
 * dictado completo de 4 minutos y el Cerebro sembrado tardó **86 s** de punta a
 * punta, con el bloque estático en 22,8k tokens. Con los documentos del vault
 * cruzando por etiqueta el bloque se duplica, así que el margen va a la baja.
 *
 * A 60 s esa ejecución se corta en Vercel **después** de haber pagado el
 * modelo: el `insert` de la consulta ocurre al cerrarse el stream, así que la
 * dieta no se guarda y el audio no se repite.
 */
export const maxDuration = 180;

type StreamEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | {
      type: "done";
      consultationId: string;
      patientId: string;
      patientName: string;
      dietVersion: number | null;
    }
  /**
   * El email dictado ya es de otro paciente, así que no se escribe nada y la
   * decisión pasa al usuario. La petición termina en 200: la generación fue
   * bien; lo que falta es saber de quién es la dieta. No lleva el documento —
   * ya está en pantalla— ni nada clínico: solo identifica a una persona.
   */
  | {
      type: "identity-conflict";
      conflict: PatientIdentityConflict;
      /**
       * Lo extraído de esta consulta, al lado del conflicto y no dentro: la
       * comparación identifica a una persona y nada más, pero la consulta hace
       * falta entera para guardarla al resolver. Sin esto se perderían kcal,
       * peso y resumen en cada conflicto. No expone nada nuevo: el cliente ya
       * tiene la dieta, que es mucho más que esto.
       */
      extraction: ExtractionResult;
    };

export async function POST(request: NextRequest) {
  const { transcription, patientMode, patientId } = (await request.json()) as {
    transcription?: string;
    patientMode?: PatientMode;
    patientId?: string | null;
  };

  if (!transcription) {
    return NextResponse.json(
      { error: "Falta la transcripción. Graba la consulta de nuevo." },
      { status: 400 },
    );
  }

  // La elección de paciente es explícita: sin modo válido no se adivina nada.
  if (patientMode !== "new" && patientMode !== "existing") {
    return NextResponse.json(
      {
        error:
          "Indica si el paciente es nuevo o existente antes de generar la dieta.",
      },
      { status: 400 },
    );
  }

  if (patientMode === "existing" && !patientId) {
    return NextResponse.json(
      { error: "Elige un paciente de la lista antes de generar la dieta." },
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

  // Memoria del paciente existente: ficha, resúmenes recientes y última dieta.
  // Se carga antes de lanzar ningún modelo: un paciente ajeno o inexistente
  // (RLS lo oculta) corta aquí, sin gastar generación ni extracción.
  let memory: PatientMemory | null = null;
  if (patientMode === "existing") {
    memory = await loadPatientMemory(supabase, patientId as string);
    if (!memory) {
      return NextResponse.json(
        { error: PATIENT_NOT_FOUND_MESSAGE },
        { status: 404 },
      );
    }
  }

  // El Cerebro se lee una sola vez, aquí, antes de llamar al modelo: el prompt
  // activo y los documentos que apliquen a este paciente. El conjunto queda
  // congelado para toda la generación, así que activar una versión a mitad no
  // la afecta. Si el Cerebro está vacío o no responde, esto devuelve los valores
  // por defecto del código en lugar de fallar.
  const { brain, degraded, reason } = await loadBrainContext(supabase, {
    memory,
  });

  if (degraded) {
    console.warn("Generating with the code defaults:", reason);
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
          memory,
          brain,
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
        const saved = await persist({
          supabase,
          userId: user.id,
          transcription,
          dietMarkdown,
          extraction,
          existingPatientId: patientMode === "existing" ? patientId! : null,
          fallbackName: memory?.personal.name_surnames ?? "",
        });

        if (saved.kind === "conflict") {
          send({
            type: "identity-conflict",
            conflict: saved.conflict,
            extraction: saved.extraction,
          });
        } else {
          const { consultationId, patientId, patientName, dietVersion } = saved;
          send({
            type: "done",
            consultationId,
            patientId,
            patientName,
            dietVersion,
          });
        }
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
  /** `null` = paciente nuevo, elegido explícitamente por el usuario. */
  existingPatientId: string | null;
  fallbackName: string;
};

/**
 * Escribe paciente y consulta en una sola pasada, al cerrar el stream.
 *
 * Si la extracción falló, `extraction` es null: la consulta se guarda igual con
 * el documento, que es la fuente de verdad, sin campos estructurados ni resumen.
 *
 * No hay emparejado implícito: un paciente existente reutiliza siempre la ficha
 * elegida, y uno nuevo crea la suya. Con una excepción que la base de datos
 * impone y el contrato ignoraba: `unique_patient_email_per_user`. Un email
 * identifica a una persona, así que si el dictado ya pertenece a otro paciente
 * **no se escribe nada** y se devuelve un conflicto para que lo resuelva quien
 * puede, que es el usuario. Antes se intentaba el `insert` igualmente y la
 * excepción tiraba la dieta ya generada.
 *
 * La versión de la dieta la asigna la base de datos al insertar.
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
    if (!patient?.name_surnames) {
      throw new Error(NEW_PATIENT_WITHOUT_NAME_MESSAGE);
    }

    // Antes de escribir, no después de que reviente: se busca al dueño del
    // email. Mirar el código `23505` del `insert` también funcionaría, pero
    // dejaría la decisión colgando del nombre de una restricción creada fuera
    // del repo, y haría falta esta consulta igualmente para la comparación.
    const owner = await findPatientByMail(supabase, patient.mail);
    if (owner) {
      return {
        kind: "conflict" as const,
        conflict: buildIdentityConflict(owner, patient),
        // Llegar aquí exige que la extracción trajera nombre, así que existe.
        extraction: extraction!,
      };
    }

    const { data: newPatient, error } = await supabase
      .from("patients")
      .insert({ ...patient, created_by: userId })
      .select("id")
      .single();

    if (error) throw new Error(`Error creating patient: ${error.message}`);
    patientId = newPatient.id;
  }

  const { data: record, error: consultationError } = await supabase
    .from("patient_consultations")
    .insert({
      ...consultation,
      // El peso del paciente se sobrescribe en cada consulta; aquí queda el
      // de esta, para el histórico. Sin peso dictado, null: nunca se copia.
      weight: patient?.weight ?? null,
      patient_id: patientId,
      created_by: userId,
      audio_transcription: transcription,
      diet_md: dietMarkdown,
    })
    .select("id, diet_version")
    .single();

  if (consultationError) {
    throw new Error(
      `Error creating consultation: ${consultationError.message}`,
    );
  }

  return {
    kind: "saved" as const,
    consultationId: record.id as string,
    patientId: patientId as string,
    patientName: patient?.name_surnames || fallbackName,
    dietVersion: (record.diet_version as number | null) ?? null,
  };
}

/**
 * El paciente del usuario que ya tiene ese email, si lo hay.
 *
 * Sin email no hay choque posible: una consulta que no lo dicta sigue su camino.
 * RLS acota la búsqueda a los pacientes propios, así que el email de otra
 * nutricionista no bloquea nada aquí.
 */
async function findPatientByMail(
  supabase: PersistArgs["supabase"],
  mail: string | null | undefined,
) {
  const normalized = normalizeMail(mail);
  if (!normalized) return null;

  const { data } = await supabase
    .from("patients")
    .select("id, name_surnames, mail, age, phone")
    .ilike("mail", normalized)
    .maybeSingle();

  return data ?? null;
}
