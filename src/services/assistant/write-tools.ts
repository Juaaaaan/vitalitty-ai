import {
  ToolInputError,
  ToolNotFoundError,
  type AssistantToolContext,
} from "@/models/assistant/assistant.models";
import { loadPatientMemory } from "@/services/patient-context-service";
import { streamDietGeneration } from "@/services/diet-generation-service";
import { loadBrainContext } from "@/services/brain-retrieval-service";
import { UnstructuredDietError } from "@/services/diet-pdf-service";
import { documentLink, loadPdfState, signPdf } from "@/services/diet-pdf-cache";
import { renderAndStoreDietPdf } from "@/services/diet-pdf-store";
import {
  parseGenerateDiet,
  parseRenderPdf,
} from "@/services/assistant/catalog";

/**
 * Ejecutores de las herramientas de ESCRITURA.
 *
 * Solo los importa la ruta de confirmación, nunca el bucle del agente: aquí
 * está lo caro (una generación completa, Chromium) y lo que persiste. Que el
 * bucle no pueda ni cargarlas es la garantía estructural de que ninguna
 * escritura ocurre sin que el usuario la confirme; una instrucción en el prompt
 * no lo sería.
 *
 * Todo se revalida: los argumentos y que el paciente sea del usuario. Que la
 * acción viniera de una propuesta no se da por bueno.
 */

async function generarDieta(ctx: AssistantToolContext, input: unknown) {
  const { pacienteId, instrucciones } = parseGenerateDiet(input);

  const memory = await loadPatientMemory(ctx.supabase, pacienteId);
  if (!memory) throw new ToolNotFoundError();

  // Una dieta generada desde el asistente es una generación como cualquier otra:
  // lee el mismo prompt activo y el mismo conocimiento que la de una consulta
  // grabada. Si no, el retoque se saldría del Cerebro sin que nadie lo pidiera.
  const { brain } = await loadBrainContext(ctx.supabase, { memory });

  let dietMarkdown = "";
  for await (const event of streamDietGeneration({
    instruction: instrucciones,
    memory,
    brain,
  })) {
    if (event.type === "text") dietMarkdown += event.text;
  }

  if (!dietMarkdown.trim()) {
    throw new Error("Diet generation produced an empty document");
  }

  // Versión nueva, no corrección: se inserta una consulta y el trigger le
  // asigna N+1. Sin `audio_transcription`, porque no hubo consulta grabada.
  const { data, error } = await ctx.supabase
    .from("patient_consultations")
    .insert({
      patient_id: pacienteId,
      created_by: ctx.userId,
      diet_md: dietMarkdown,
      consultation_summary: `Retoque pedido desde el asistente: ${instrucciones}`,
    })
    .select("id, diet_version")
    .single();

  if (error) throw new Error(error.message);

  return {
    consulta_id: data.id,
    version: data.diet_version,
    documento: dietMarkdown,
  };
}

async function renderPdf(ctx: AssistantToolContext, input: unknown) {
  const { consultaId } = parseRenderPdf(input);
  const state = await loadPdfState(ctx.supabase, consultaId);

  if (state.status === "not_found") {
    throw new ToolNotFoundError("No se encuentra esa dieta.");
  }

  if (state.status === "fresh") {
    return {
      documento: documentLink(
        state.row,
        await signPdf(ctx.supabase, state.path),
      ),
      creado: false,
    };
  }

  try {
    const path = await renderAndStoreDietPdf(
      ctx.supabase,
      ctx.userId,
      state.row,
      state.hash,
    );

    return {
      documento: documentLink(state.row, await signPdf(ctx.supabase, path)),
      creado: true,
    };
  } catch (error) {
    if (error instanceof UnstructuredDietError) {
      throw new ToolInputError(error.message);
    }
    throw error;
  }
}

export type WriteToolExecutor = (
  ctx: AssistantToolContext,
  input: unknown,
) => Promise<unknown>;

export const WRITE_TOOLS: Record<string, WriteToolExecutor> = {
  generar_dieta: generarDieta,
  render_pdf: renderPdf,
};
