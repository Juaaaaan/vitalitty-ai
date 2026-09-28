import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  streamDietGeneration,
  extractConsultationData,
  createClient,
  supabase,
} = vi.hoisted(() => {
  const supabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  };
  return {
    streamDietGeneration: vi.fn(),
    extractConsultationData: vi.fn(),
    createClient: vi.fn(async () => supabase),
    supabase,
  };
});

vi.mock("@/services/diet-generation-service", () => ({ streamDietGeneration }));
vi.mock("@/services/consultation-extraction-service", () => ({
  extractConsultationData,
}));
vi.mock("../../../../lib/supabase/server", () => ({ createClient }));

import { POST } from "../route";

function requestWith(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

async function readEvents(response: Response) {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function generationOf(events: unknown[]) {
  return async function* () {
    for (const event of events) yield event;
  };
}

/** Cadena mínima de Supabase: todo encadenable, el resultado se pide al final. */
function stubTable(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    update: () => chain,
    insert: () => chain,
    single: async () => ({ data: { id: "consultation-1" }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    ...overrides,
  };
  return chain;
}

describe("POST /api/process-consultation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    supabase.from.mockImplementation(() => stubTable());
    extractConsultationData.mockResolvedValue({
      patient: { name_surnames: "Laura Martín" },
      consultation: { objetivo_calorias: 1450 },
    });
  });

  it("emite razonamiento, texto y cierre con consultationId, en ese orden", async () => {
    streamDietGeneration.mockImplementation(
      generationOf([
        { type: "thinking", text: "Reviso calorías" },
        { type: "text", text: "# Plan" },
        { type: "text", text: " nutricional" },
        {
          type: "usage",
          cacheReadInputTokens: 2500,
          cacheCreationInputTokens: 0,
          inputTokens: 300,
          outputTokens: 4000,
        },
      ]),
    );

    const events = await readEvents(
      await POST(requestWith({ transcription: "consulta" })),
    );

    expect(events.map((e) => e.type)).toEqual([
      "thinking",
      "text",
      "text",
      "done",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      consultationId: "consultation-1",
      patientName: "Laura Martín",
    });
  });

  it("escribe una consulta cuando la generación termina", async () => {
    const insert = vi.fn(() => stubTable());
    supabase.from.mockImplementation(() => stubTable({ insert }));
    streamDietGeneration.mockImplementation(
      generationOf([{ type: "text", text: "# Plan nutricional" }]),
    );

    await readEvents(await POST(requestWith({ transcription: "consulta" })));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        diet_md: "# Plan nutricional",
        audio_transcription: "consulta",
      }),
    );
  });

  it("no escribe nada si la generación falla a mitad", async () => {
    const insert = vi.fn(() => stubTable());
    supabase.from.mockImplementation(() => stubTable({ insert }));
    streamDietGeneration.mockImplementation(async function* () {
      yield { type: "text", text: "# Plan" };
      throw new Error("modelo cayó");
    });

    const events = await readEvents(
      await POST(requestWith({ transcription: "consulta" })),
    );

    expect(events.map((e) => e.type)).toEqual(["text", "error"]);
    expect(events.at(-1).message).toContain("modelo cayó");
    expect(insert).not.toHaveBeenCalled();
  });

  it("guarda la consulta aunque la extracción falle", async () => {
    extractConsultationData.mockRejectedValue(new Error("haiku cayó"));
    const insert = vi.fn(() => stubTable());
    supabase.from.mockImplementation(() => stubTable({ insert }));
    streamDietGeneration.mockImplementation(
      generationOf([{ type: "text", text: "# Plan" }]),
    );

    const events = await readEvents(
      await POST(
        requestWith({ transcription: "consulta", existingPatientId: "p1" }),
      ),
    );

    expect(events.at(-1).type).toBe("done");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ diet_md: "# Plan", patient_id: "p1" }),
    );
  });

  it("genera sin dieta anterior cuando el paciente no tiene consultas previas", async () => {
    streamDietGeneration.mockImplementation(
      generationOf([{ type: "text", text: "# Plan" }]),
    );

    await readEvents(
      await POST(
        requestWith({ transcription: "consulta", existingPatientId: "p1" }),
      ),
    );

    expect(streamDietGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ previousDietMd: null }),
    );
  });

  it("pasa la dieta anterior al servicio cuando existe", async () => {
    supabase.from.mockImplementation((table: string) =>
      table === "patient_consultations"
        ? stubTable({
            maybeSingle: async () => ({
              data: { diet_md: "# Dieta anterior" },
              error: null,
            }),
          })
        : stubTable(),
    );
    streamDietGeneration.mockImplementation(
      generationOf([{ type: "text", text: "# Plan" }]),
    );

    await readEvents(
      await POST(
        requestWith({ transcription: "consulta", existingPatientId: "p1" }),
      ),
    );

    expect(streamDietGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ previousDietMd: "# Dieta anterior" }),
    );
  });

  it("rechaza sin transcripción y no llama al modelo", async () => {
    const response = await POST(requestWith({}));

    expect(response.status).toBe(400);
    expect(streamDietGeneration).not.toHaveBeenCalled();
  });
});
