import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import type {
  AssistantEvent,
  AssistantMessage,
} from "@/models/assistant/assistant.models";
import { runAssistantTurn } from "@/services/assistant/agent-loop";
import { TURN_FAILED_MESSAGE } from "@/services/assistant/prompt";

/**
 * Vuelta del asistente: el bucle de herramientas corre entero aquí, en el
 * servidor. El navegador nunca ve la clave del modelo ni el catálogo, y no
 * decide qué se ejecuta — que es justo lo que sostiene la regla de escrituras
 * confirmadas.
 *
 * Responde NDJSON, un evento por línea, igual que `/api/process-consultation`.
 *
 * Las herramientas de lectura son consultas a Supabase; la única cara es
 * comparar dietas cuando la comparación no está calculada. La generación de
 * dieta y el render del PDF NO ocurren aquí: viven en `confirm`, con su propio
 * presupuesto de tiempo.
 */
export const maxDuration = 60;

const MAX_THREAD_MESSAGES = 40;

function isThread(value: unknown): value is AssistantMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_THREAD_MESSAGES &&
    value.every(
      (message) =>
        message != null &&
        typeof message === "object" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim() !== "",
    ) &&
    value.at(-1)?.role === "user"
  );
}

export async function POST(request: NextRequest) {
  const { messages } = (await request.json()) as { messages?: unknown };

  if (!isThread(messages)) {
    return NextResponse.json(
      { error: "Escribe una pregunta para el asistente." },
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AssistantEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        for await (const event of runAssistantTurn(messages, {
          supabase,
          userId: user.id,
        })) {
          send(event);
        }

        send({ type: "done" });
      } catch (error) {
        console.error("Assistant turn failed:", error);
        send({ type: "error", message: TURN_FAILED_MESSAGE });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
