import type Anthropic from "@anthropic-ai/sdk";
import anthropic from "../../../lib/ai/anthropic";
import {
  ToolInputError,
  ToolNotFoundError,
  type AssistantEvent,
  type AssistantMessage,
  type AssistantToolContext,
} from "@/models/assistant/assistant.models";
import { TOOL_LABELS, findTool } from "@/services/assistant/catalog";
import { prepareWriteTool } from "@/services/assistant/proposals";
import { READ_TOOLS } from "@/services/assistant/read-tools";
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_MODEL,
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_TOOL_DEFINITIONS,
  ITERATION_LIMIT_MESSAGE,
  MAX_TOOL_ITERATIONS,
  todayHeader,
} from "@/services/assistant/prompt";

/**
 * Bucle acotado de herramientas: modelo → herramienta → resultado → modelo,
 * hasta la respuesta final.
 *
 * El modelo no ve SQL, shell ni ficheros: solo los nombres del catálogo. Las
 * herramientas de lectura se ejecutan solas; las de escritura NO se ejecutan
 * aquí — se preparan como propuesta y la vuelta se cierra. Ejecutarlas es cosa
 * de la ruta de confirmación, que este módulo ni siquiera importa.
 *
 * El tope de iteraciones no es paranoia: la ruta vive bajo `maxDuration = 60`,
 * y una vuelta que encadena herramientas sin fin se la comería entera para no
 * devolver nada.
 */

export interface AgentTurnOptions {
  /** Permite inyectar un doble en las pruebas. */
  createMessage?: (
    params: Anthropic.MessageCreateParamsNonStreaming,
  ) => Promise<Anthropic.Message>;
  now?: Date;
}

function buildRequest(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: ASSISTANT_MODEL,
    max_tokens: ASSISTANT_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: ASSISTANT_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: ASSISTANT_TOOL_DEFINITIONS as Anthropic.Tool[],
    messages,
  };
}

/**
 * Resultado de una herramienta partido en dos: lo que ve la pantalla y lo que
 * ve el modelo.
 *
 * Un enlace firmado no entra en el contexto del modelo. Se le enseña al usuario
 * como evento `document` y al modelo se le dice que ya está en pantalla, para
 * que lo cuente sin pegarlo — pegado ocupa cientos de caracteres, caduca y
 * puede salir truncado.
 */
function splitDocument(value: unknown): {
  event?: Extract<AssistantEvent, { type: "document" }>;
  forModel: unknown;
} {
  if (value == null || typeof value !== "object" || !("documento" in value)) {
    return { forModel: value };
  }

  const { documento, ...rest } = value as {
    documento: { url: string; version: number | null; fecha: string | null };
  } & Record<string, unknown>;

  return {
    event: { type: "document", ...documento },
    forModel: {
      ...rest,
      documento: {
        version: documento.version,
        fecha: documento.fecha,
        enlace_mostrado: true,
      },
    },
  };
}

/** Un error de herramienta vuelve al modelo como resultado, no rompe la vuelta. */
function toolErrorText(error: unknown): string {
  if (error instanceof ToolInputError || error instanceof ToolNotFoundError) {
    return error.message;
  }

  console.error("Assistant tool failed:", error);
  return "La consulta ha fallado. Cuéntaselo al usuario y sigue con lo que sí sepas.";
}

/**
 * Convierte el hilo del cliente en mensajes de la API. La fecha de hoy se
 * antepone al último mensaje del usuario: fuera del bloque cacheado, que no
 * puede llevar nada que cambie.
 */
export function toApiMessages(
  thread: AssistantMessage[],
  now: Date,
): Anthropic.MessageParam[] {
  return thread.map((message, index) => ({
    role: message.role,
    content:
      message.role === "user" && index === thread.length - 1
        ? `${todayHeader(now)}\n\n${message.content}`
        : message.content,
  }));
}

export async function* runAssistantTurn(
  thread: AssistantMessage[],
  ctx: AssistantToolContext,
  options: AgentTurnOptions = {},
): AsyncGenerator<AssistantEvent> {
  const createMessage =
    options.createMessage ??
    ((params: Anthropic.MessageCreateParamsNonStreaming) =>
      anthropic.messages.create(params) as Promise<Anthropic.Message>);

  const messages = toApiMessages(thread, options.now ?? new Date());

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await createMessage(buildRequest(messages));

    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        yield { type: "text", text: block.text };
      }
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUses.length === 0) return;

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      const definition = findTool(toolUse.name);

      yield {
        type: "tool_start",
        tool: toolUse.name,
        label: TOOL_LABELS[toolUse.name] ?? "Consultando…",
      };

      if (!definition) {
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: `No existe la herramienta ${toolUse.name}.`,
        });
        yield { type: "tool_end", tool: toolUse.name, ok: false };
        continue;
      }

      try {
        if (definition.kind === "write") {
          const outcome = await prepareWriteTool(
            ctx,
            toolUse.name,
            toolUse.input,
          );

          if (outcome.kind === "proposal") {
            // La escritura NO se ejecuta: se propone y la vuelta acaba aquí.
            // Lo que el usuario confirme lo ejecuta otra ruta, que revalida.
            yield { type: "tool_end", tool: toolUse.name, ok: true };
            yield { type: "proposal", action: outcome.action };
            return;
          }

          const { event, forModel } = splitDocument(outcome.value);
          if (event) yield event;

          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(forModel),
          });
        } else {
          const value = await READ_TOOLS[toolUse.name](ctx, toolUse.input);
          const { event, forModel } = splitDocument(value);
          if (event) yield event;

          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(forModel),
          });
        }

        yield { type: "tool_end", tool: toolUse.name, ok: true };
      } catch (error) {
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: toolErrorText(error),
        });
        yield { type: "tool_end", tool: toolUse.name, ok: false };
      }
    }

    messages.push({ role: "user", content: results });
  }

  // Se agotaron las iteraciones: se cierra diciéndolo, en vez de seguir.
  yield { type: "text", text: ITERATION_LIMIT_MESSAGE };
}
