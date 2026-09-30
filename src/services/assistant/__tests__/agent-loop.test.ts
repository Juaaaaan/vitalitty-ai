import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("../../../../lib/ai/anthropic", () => ({
  default: { messages: { create: createMock } },
}));

import type Anthropic from "@anthropic-ai/sdk";
import {
  runAssistantTurn,
  toApiMessages,
} from "@/services/assistant/agent-loop";
import {
  ASSISTANT_SYSTEM_PROMPT,
  ITERATION_LIMIT_MESSAGE,
  MAX_TOOL_ITERATIONS,
} from "@/services/assistant/prompt";
import type {
  AssistantEvent,
  AssistantToolContext,
} from "@/models/assistant/assistant.models";
import { pdfSourceHash } from "@/services/diet-pdf-cache";
import { fakeSupabase } from "./fake-supabase";

const PATIENTS = [
  {
    id: "p1",
    name_surnames: "Rubén Díaz",
    mail: "ruben@example.com",
    phone: "600111222",
  },
];

let tables: Record<string, Record<string, unknown>[]> = {
  patients: PATIENTS,
  patient_consultations: [],
};

const ctx = () =>
  ({ supabase: fakeSupabase(tables), userId: "u1" }) as AssistantToolContext;

function text(content: string): Anthropic.Message {
  return {
    content: [{ type: "text", text: content }],
    stop_reason: "end_turn",
  } as unknown as Anthropic.Message;
}

function toolUse(name: string, input: unknown): Anthropic.Message {
  return {
    content: [{ type: "tool_use", id: `tu-${name}`, name, input }],
    stop_reason: "tool_use",
  } as unknown as Anthropic.Message;
}

async function collect(responses: Anthropic.Message[]): Promise<{
  events: AssistantEvent[];
  requests: unknown[];
  toolResults: string[];
}> {
  const requests: unknown[] = [];
  let next = 0;

  const createMessage = async (params: unknown) => {
    requests.push(params);
    return responses[Math.min(next++, responses.length - 1)];
  };

  const events: AssistantEvent[] = [];
  for await (const event of runAssistantTurn(
    [{ role: "user", content: "¿qué tal va Rubén?" }],
    ctx(),
    { createMessage, now: new Date(2026, 8, 29) },
  )) {
    events.push(event);
  }

  // Lo que el modelo recibe de vuelta de cada herramienta.
  const toolResults = requests.flatMap((request) =>
    (
      (request as { messages: Anthropic.MessageParam[] }).messages ?? []
    ).flatMap((message) =>
      Array.isArray(message.content)
        ? message.content
            .filter((block) => block.type === "tool_result")
            .map((block) => JSON.stringify(block))
        : [],
    ),
  );

  return { events, requests, toolResults };
}

beforeEach(() => {
  createMock.mockReset();
  tables = { patients: PATIENTS, patient_consultations: [] };
});

describe("runAssistantTurn", () => {
  it("una vuelta sin herramientas devuelve el texto y para", async () => {
    const { events, requests } = await collect([text("No tengo ese dato.")]);

    expect(events).toEqual([{ type: "text", text: "No tengo ese dato." }]);
    expect(requests).toHaveLength(1);
  });

  it("encadena dos lecturas y devuelve la respuesta final", async () => {
    const { events } = await collect([
      toolUse("buscar_paciente", { texto: "Rubén" }),
      toolUse("get_paciente", { paciente_id: "p1" }),
      text("Rubén está bien."),
    ]);

    expect(events.filter((event) => event.type === "tool_start")).toHaveLength(
      2,
    );
    expect(
      events.filter((event) => event.type === "tool_end" && event.ok),
    ).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: "text", text: "Rubén está bien." });
  });

  it("una herramienta de escritura se propone y la vuelta acaba ahí", async () => {
    const { events, requests } = await collect([
      toolUse("generar_dieta", {
        paciente_id: "p1",
        instrucciones: "sube el hidrato de la cena",
      }),
      text("no debería llegar aquí"),
    ]);

    const proposal = events.find((event) => event.type === "proposal");
    expect(proposal).toBeDefined();
    if (proposal?.type !== "proposal") throw new Error("sin propuesta");

    expect(proposal.action.tool).toBe("generar_dieta");
    expect(proposal.action.patientName).toBe("Rubén Díaz");
    expect(proposal.action.summary).toContain("sube el hidrato de la cena");

    // No se vuelve a llamar al modelo: la vuelta se cierra con la propuesta.
    expect(requests).toHaveLength(1);
    expect(events.at(-1)).toBe(proposal);
  });

  it("una herramienta que no existe vuelve como error sin cortar la conversación", async () => {
    const { events } = await collect([
      toolUse("borrar_paciente", { paciente_id: "p1" }),
      text("No puedo hacer eso desde aquí."),
    ]);

    expect(events).toContainEqual({
      type: "tool_end",
      tool: "borrar_paciente",
      ok: false,
    });
    expect(events.at(-1)).toEqual({
      type: "text",
      text: "No puedo hacer eso desde aquí.",
    });
  });

  it("una herramienta que falla vuelve como error y el modelo sigue", async () => {
    const { events } = await collect([
      toolUse("get_paciente", { paciente_id: "de-otro" }),
      text("No encuentro a ese paciente."),
    ]);

    expect(events).toContainEqual({
      type: "tool_end",
      tool: "get_paciente",
      ok: false,
    });
    expect(events.at(-1)).toEqual({
      type: "text",
      text: "No encuentro a ese paciente.",
    });
  });

  it("al agotar las iteraciones cierra diciéndolo, no sigue", async () => {
    const { events, requests } = await collect([
      toolUse("buscar_paciente", { texto: "Rubén" }),
    ]);

    expect(requests).toHaveLength(MAX_TOOL_ITERATIONS);
    expect(events.at(-1)).toEqual({
      type: "text",
      text: ITERATION_LIMIT_MESSAGE,
    });
  });

  it("un documento va como enlace propio y su URL no llega al modelo", async () => {
    tables = {
      patients: PATIENTS,
      patient_consultations: [
        {
          id: "c2",
          patient_id: "p1",
          diet_version: 17,
          diet_md: "# v17",
          pdf_path: "u1/p1/c2.pdf",
          // Coincide con la huella, así que el PDF guardado sigue sirviendo:
          // no hay nada que escribir y no se propone nada.
          pdf_source_hash: pdfSourceHash("# v17"),
          created_at: "2026-09-29T10:00:00Z",
        },
      ],
    };

    const { events, toolResults } = await collect([
      toolUse("render_pdf", { consulta_id: "c2" }),
      text("La dieta v17 está disponible."),
    ]);

    const document = events.find((event) => event.type === "document");
    expect(document).toBeDefined();
    if (document?.type !== "document") throw new Error("sin documento");

    expect(document.version).toBe(17);
    expect(document.fecha).toBe("2026-09-29");
    expect(document.url).toContain("token=");

    // El enlace firmado no entra en el contexto: caduca, es larguísimo y el
    // modelo lo repetiría en la respuesta.
    expect(toolResults.join(" ")).not.toContain("token=");
    expect(toolResults.join(" ")).toContain("enlace_mostrado");
    expect(toolResults.join(" ")).toContain("17");
  });

  it("el prompt prohíbe pegar URLs en la respuesta", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("NUNCA escribas una URL");
  });

  it("el bloque estático va primero, con el corte de caché, y el hilo después", async () => {
    const { requests } = await collect([text("ok")]);
    const request = requests[0] as {
      system: Array<{ text: string; cache_control?: unknown }>;
      messages: Array<{ content: string }>;
    };

    expect(request.system[0].text).toBe(ASSISTANT_SYSTEM_PROMPT);
    expect(request.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(request.system).toHaveLength(1);
    expect(request.messages[0].content).toContain("¿qué tal va Rubén?");
  });
});

describe("toApiMessages", () => {
  it("la fecha de hoy va en el mensaje, nunca en el bloque estático", () => {
    const messages = toApiMessages(
      [
        { role: "user", content: "hola" },
        { role: "assistant", content: "dime" },
        { role: "user", content: "revisiones de esta semana" },
      ],
      new Date(2026, 8, 29),
    );

    expect(messages[0].content).toBe("hola");
    expect(messages[2].content).toContain("2026-09-29");
    // "Esta semana" resuelta: sin esto el modelo la tomaba desde hoy y se
    // dejaba fuera las citas del principio de la semana.
    expect(messages[2].content).toContain("lunes 2026-09-28");
    expect(messages[2].content).toContain("domingo 2026-10-04");
    expect(ASSISTANT_SYSTEM_PROMPT).not.toContain("2026");
  });
});
