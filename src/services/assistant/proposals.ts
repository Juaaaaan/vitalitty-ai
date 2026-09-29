import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ToolInputError,
  ToolNotFoundError,
  type AssistantToolContext,
  type ProposedAction,
} from "@/models/assistant/assistant.models";
import { documentLink, loadPdfState, signPdf } from "@/services/diet-pdf-cache";
import {
  parseGenerateDiet,
  parseRenderPdf,
} from "@/services/assistant/catalog";

/**
 * Prepara una herramienta de escritura **sin ejecutarla**.
 *
 * Es lo que el bucle del agente llama cuando el modelo pide escribir: valida
 * los argumentos, comprueba que el paciente es del usuario y devuelve la
 * propuesta que verá la pantalla. Nada se persiste aquí.
 *
 * Deliberadamente sin `diet-pdf-service` ni el generador: el bucle no debe
 * cargar Chromium ni el modelo de generación solo para redactar una propuesta.
 *
 * Único caso que no es propuesta: un PDF que ya existe y corresponde al
 * documento actual. Ahí no hay nada que escribir, así que se entrega el enlace
 * directamente, como haría una lectura.
 */
export type WriteToolOutcome =
  | { kind: "result"; value: unknown }
  | { kind: "proposal"; action: ProposedAction };

async function patientName(
  supabase: SupabaseClient,
  patientId: string,
): Promise<string> {
  const { data } = await supabase
    .from("patients")
    .select("name_surnames")
    .eq("id", patientId)
    .maybeSingle();

  if (!data) throw new ToolNotFoundError();

  return (data as { name_surnames: string }).name_surnames;
}

export async function prepareWriteTool(
  ctx: AssistantToolContext,
  name: string,
  input: unknown,
): Promise<WriteToolOutcome> {
  if (name === "generar_dieta") {
    const { pacienteId, instrucciones } = parseGenerateDiet(input);
    const nombre = await patientName(ctx.supabase, pacienteId);

    return {
      kind: "proposal",
      action: {
        tool: name,
        input: { paciente_id: pacienteId, instrucciones },
        patientName: nombre,
        summary: `Generar una versión nueva de la dieta de ${nombre} aplicando: ${instrucciones}`,
      },
    };
  }

  if (name === "render_pdf") {
    const { consultaId } = parseRenderPdf(input);
    const state = await loadPdfState(ctx.supabase, consultaId);

    if (state.status === "not_found")
      throw new ToolNotFoundError("No se encuentra esa dieta.");

    if (state.status === "fresh") {
      return {
        kind: "result",
        value: {
          documento: documentLink(
            state.row,
            await signPdf(ctx.supabase, state.path),
          ),
          creado: false,
        },
      };
    }

    const nombre = await patientName(ctx.supabase, state.row.patient_id);

    return {
      kind: "proposal",
      action: {
        tool: name,
        input: { consulta_id: consultaId },
        patientName: nombre,
        summary: `Crear y guardar el PDF de marca de la dieta de ${nombre}.`,
      },
    };
  }

  throw new ToolInputError(`No existe la herramienta ${name}.`);
}
