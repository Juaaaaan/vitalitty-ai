import { beforeEach, describe, expect, it, vi } from "vitest";

const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }));

vi.mock("../../../lib/ai/anthropic", () => ({
  default: { messages: { stream: streamMock } },
}));

import {
  buildDietGenerationRequest,
  streamDietGeneration,
  STATIC_PROMPT_BLOCK,
  type DietGenerationInput,
} from "@/services/diet-generation-service";
import type { PatientMemory } from "@/models/patient-context/patient-memory.models";

const PERSONAL = {
  name_surnames: "Laura Martín",
  age: 34,
  gender: "F",
  height: 165,
  weight: 62,
};

function memoryWith(overrides: Partial<PatientMemory> = {}): PatientMemory {
  return {
    personal: PERSONAL,
    clinical: {},
    summaries: [],
    lastDietMd: null,
    ...overrides,
  };
}

const MEMORY = memoryWith();

function systemText(input: DietGenerationInput): string {
  const system = buildDietGenerationRequest(input).system;
  if (!Array.isArray(system)) throw new Error("system debe ser una lista");
  return system.map((block) => ("text" in block ? block.text : "")).join("");
}

function userText(input: DietGenerationInput): string {
  const content = buildDietGenerationRequest(input).messages[0].content;
  return typeof content === "string" ? content : JSON.stringify(content);
}

describe("buildDietGenerationRequest", () => {
  it("no mete datos del paciente ni de la consulta en el bloque estático", () => {
    const system = systemText({
      transcription: "sube la proteína a dos coma dos gramos por kilo",
      memory: memoryWith({ lastDietMd: "# Dieta anterior\n\nCena: merluza" }),
    });

    expect(system).not.toContain("Laura Martín");
    expect(system).not.toContain("dos coma dos");
    expect(system).not.toContain("Dieta anterior");
  });

  it("el bloque estático es idéntico entre pacientes y transcripciones distintas", () => {
    const a = systemText({ transcription: "consulta A", memory: MEMORY });
    const b = systemText({
      transcription: "consulta B totalmente distinta",
      memory: memoryWith({
        personal: { ...PERSONAL, name_surnames: "Rubén Pérez", weight: 88 },
        clinical: { alergias_intolerancias: ["lactosa"] },
        lastDietMd: "# Otra dieta",
      }),
    });

    expect(a).toBe(b);
    expect(a).toBe(STATIC_PROMPT_BLOCK);
  });

  it("marca el bloque estático para caché y deja lo variable fuera", () => {
    const request = buildDietGenerationRequest({
      transcription: "consulta",
      memory: MEMORY,
    });

    expect(request.system).toEqual([
      expect.objectContaining({ cache_control: { type: "ephemeral" } }),
    ]);
    expect(request.messages).toHaveLength(1);
  });

  it("configura el modelo, el esfuerzo y el pensamiento resumido", () => {
    const request = buildDietGenerationRequest({ transcription: "consulta" });

    expect(request.model).toBe("claude-opus-5");
    expect(request.output_config).toEqual({ effort: "medium" });
    expect(request.thinking).toEqual({
      type: "adaptive",
      display: "summarized",
    });
    expect(request.max_tokens).toBeGreaterThan(16000);
  });

  it("incluye la dieta anterior y las instrucciones de edición en revisión", () => {
    const user = userText({
      transcription: "subimos proteína",
      memory: memoryWith({ lastDietMd: "# Dieta anterior\n\nCENA: merluza" }),
    });

    expect(user).toContain("MODO REVISIÓN");
    expect(user).toContain("CENA: merluza");
  });

  it("no incluye bloque de dieta anterior cuando el paciente no tiene", () => {
    const user = userText({
      transcription: "primera consulta",
      memory: MEMORY,
    });

    expect(user).not.toContain("MODO REVISIÓN");
    expect(user).not.toContain("DIETA ANTERIOR");
    expect(user).toContain("TRANSCRIPCIÓN DE LA CONSULTA");
  });

  it("ordena memoria → modo revisión + dieta anterior → transcripción", () => {
    const user = userText({
      transcription: "consulta",
      memory: memoryWith({ lastDietMd: "# Dieta v1" }),
    });

    const memory = user.indexOf("MEMORIA DEL PACIENTE");
    const revision = user.indexOf("MODO REVISIÓN");
    const transcription = user.indexOf("TRANSCRIPCIÓN DE LA CONSULTA");
    expect(memory).toBeGreaterThanOrEqual(0);
    expect(memory).toBeLessThan(revision);
    expect(revision).toBeLessThan(transcription);
  });

  it("paciente nuevo: solo la transcripción en messages", () => {
    const user = userText({ transcription: "primera consulta", memory: null });

    expect(user).toBe("TRANSCRIPCIÓN DE LA CONSULTA\n\nprimera consulta");
  });

  it("pinta la ficha clínica y los resúmenes de la memoria", () => {
    const user = userText({
      transcription: "consulta",
      memory: memoryWith({
        clinical: {
          alergias_intolerancias: ["lactosa", "frutos secos"],
          objetivo_calorias: 1800,
        },
        summaries: [
          { version: 2, date: "2026-09-10", summary: "Sube la proteína." },
        ],
      }),
    });

    expect(user).toContain("- Nombre: Laura Martín");
    expect(user).toContain("- Alergias e intolerancias: lactosa, frutos secos");
    expect(user).toContain("- Objetivo calórico (kcal): 1800");
    expect(user).toContain("- Dieta v2 (2026-09-10): Sube la proteína.");
  });

  it("el render de la memoria es determinista", () => {
    const input = {
      transcription: "consulta",
      memory: memoryWith({
        clinical: { medicacion: "Finasteride 1mg/día", patologias: ["SII"] },
      }),
    };

    expect(userText(input)).toBe(userText(structuredClone(input)));
  });

  it("usa un único breakpoint de caché", () => {
    const request = buildDietGenerationRequest({
      transcription: "consulta",
      memory: memoryWith({ lastDietMd: "# Dieta v1" }),
    });

    const breakpoints = JSON.stringify(request).match(/cache_control/g) ?? [];
    expect(breakpoints).toHaveLength(1);
  });

  it("el bloque estático explica cómo usar la memoria del paciente", () => {
    expect(STATIC_PROMPT_BLOCK).toContain("## MEMORIA DEL PACIENTE");
  });
});

describe("streamDietGeneration", () => {
  beforeEach(() => {
    streamMock.mockReset();
  });

  function fakeStream(events: unknown[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) yield event;
      },
      finalMessage: async () => ({
        usage: {
          cache_read_input_tokens: 2500,
          cache_creation_input_tokens: 0,
          input_tokens: 300,
          output_tokens: 4000,
        },
      }),
    };
  }

  it("emite los fragmentos conforme llegan, no de golpe al final", async () => {
    streamMock.mockReturnValue(
      fakeStream([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "# Plan" },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: " nutricional" },
        },
      ]),
    );

    const seen: string[] = [];
    for await (const event of streamDietGeneration({ transcription: "c" })) {
      if (event.type === "text") seen.push(event.text);
    }

    expect(seen).toEqual(["# Plan", " nutricional"]);
  });

  it("emite el resumen de razonamiento como evento aparte del documento", async () => {
    streamMock.mockReturnValue(
      fakeStream([
        {
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "Reviso las calorías" },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "# Plan" },
        },
      ]),
    );

    const events = [];
    for await (const event of streamDietGeneration({ transcription: "c" })) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      type: "thinking",
      text: "Reviso las calorías",
    });
    expect(events[1]).toEqual({ type: "text", text: "# Plan" });
  });

  it("cierra con las métricas de caché", async () => {
    streamMock.mockReturnValue(fakeStream([]));

    const events = [];
    for await (const event of streamDietGeneration({ transcription: "c" })) {
      events.push(event);
    }

    expect(events.at(-1)).toEqual({
      type: "usage",
      cacheReadInputTokens: 2500,
      cacheCreationInputTokens: 0,
      inputTokens: 300,
      outputTokens: 4000,
    });
  });
});
