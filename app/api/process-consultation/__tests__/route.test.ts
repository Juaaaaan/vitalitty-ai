import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  streamDietGeneration,
  extractConsultationData,
  loadPatientMemory,
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
    loadPatientMemory: vi.fn(),
    createClient: vi.fn(async () => supabase),
    supabase,
  };
});

vi.mock("@/services/diet-generation-service", () => ({ streamDietGeneration }));
vi.mock("@/services/consultation-extraction-service", () => ({
  extractConsultationData,
}));
vi.mock("@/services/patient-context-service", () => ({ loadPatientMemory }));
vi.mock("../../../../lib/supabase/server", () => ({ createClient }));

import { POST } from "../route";
import {
  NEW_PATIENT_WITHOUT_NAME_MESSAGE,
  PATIENT_NOT_FOUND_MESSAGE,
} from "@/constants/patient-memory";

const MEMORY = {
  personal: {
    name_surnames: "Laura Martín",
    age: 34,
    gender: "F",
    height: 165,
    weight: 62,
  },
  clinical: { alergias_intolerancias: ["lactosa"] },
  summaries: [],
  lastDietMd: "# Dieta anterior",
};

const NEW = { transcription: "consulta", patientMode: "new" };
const EXISTING = {
  transcription: "consulta",
  patientMode: "existing",
  patientId: "p1",
};

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
    single: async () => ({
      data: { id: "consultation-1", diet_version: 1 },
      error: null,
    }),
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
    loadPatientMemory.mockResolvedValue(MEMORY);
    extractConsultationData.mockResolvedValue({
      patient: { name_surnames: "Laura Martín" },
      consultation: {
        objetivo_calorias: 1450,
        consultation_summary: "Primera consulta.",
      },
    });
    streamDietGeneration.mockImplementation(
      generationOf([{ type: "text", text: "# Plan" }]),
    );
  });

  it("emite razonamiento, texto y cierre con consultationId y versión, en ese orden", async () => {
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

    const events = await readEvents(await POST(requestWith(NEW)));

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
      dietVersion: 1,
    });
  });

  it("escribe la consulta con su resumen cuando la generación termina", async () => {
    const insert = vi.fn(() => stubTable());
    supabase.from.mockImplementation(() => stubTable({ insert }));
    streamDietGeneration.mockImplementation(
      generationOf([{ type: "text", text: "# Plan nutricional" }]),
    );

    await readEvents(await POST(requestWith(NEW)));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        diet_md: "# Plan nutricional",
        audio_transcription: "consulta",
        consultation_summary: "Primera consulta.",
      }),
    );
  });

  it("guarda en la consulta el peso dictado, además de actualizar el paciente", async () => {
    extractConsultationData.mockResolvedValue({
      patient: { name_surnames: "Laura Martín", weight: 62 },
      consultation: {},
    });
    const inserts: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    supabase.from.mockImplementation((table: string) =>
      stubTable({
        insert: (row: Record<string, unknown>) => {
          if (table === "patient_consultations") inserts.push(row);
          return stubTable();
        },
        update: (row: Record<string, unknown>) => {
          if (table === "patients") updates.push(row);
          return stubTable();
        },
      }),
    );

    await readEvents(await POST(requestWith(EXISTING)));

    expect(inserts[0]).toMatchObject({ weight: 62 });
    expect(updates[0]).toMatchObject({ weight: 62 });
  });

  it("sin peso dictado: la consulta se guarda sin peso y el del paciente no se toca", async () => {
    extractConsultationData.mockResolvedValue({
      patient: { name_surnames: "Laura Martín", weight: null },
      consultation: {},
    });
    const inserts: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    supabase.from.mockImplementation((table: string) =>
      stubTable({
        insert: (row: Record<string, unknown>) => {
          if (table === "patient_consultations") inserts.push(row);
          return stubTable();
        },
        update: (row: Record<string, unknown>) => {
          if (table === "patients") updates.push(row);
          return stubTable();
        },
      }),
    );

    await readEvents(await POST(requestWith(EXISTING)));

    expect(inserts[0]).toMatchObject({ weight: null });
    expect(updates[0]).not.toHaveProperty("weight");
  });

  it("extracción fallida: la consulta se guarda sin peso", async () => {
    extractConsultationData.mockRejectedValue(new Error("haiku cayó"));
    const insert = vi.fn(() => stubTable());
    supabase.from.mockImplementation(() => stubTable({ insert }));

    await readEvents(await POST(requestWith(EXISTING)));

    const [row] = insert.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(row).toMatchObject({ weight: null });
  });

  it("no escribe nada si la generación falla a mitad", async () => {
    const insert = vi.fn(() => stubTable());
    supabase.from.mockImplementation(() => stubTable({ insert }));
    streamDietGeneration.mockImplementation(async function* () {
      yield { type: "text", text: "# Plan" };
      throw new Error("modelo cayó");
    });

    const events = await readEvents(await POST(requestWith(NEW)));

    expect(events.map((e) => e.type)).toEqual(["text", "error"]);
    expect(events.at(-1).message).toContain("modelo cayó");
    expect(insert).not.toHaveBeenCalled();
  });

  it("paciente existente: guarda sin resumen ni error si la extracción falla", async () => {
    extractConsultationData.mockRejectedValue(new Error("haiku cayó"));
    const insert = vi.fn(() => stubTable());
    supabase.from.mockImplementation(() => stubTable({ insert }));

    const events = await readEvents(await POST(requestWith(EXISTING)));

    expect(events.at(-1).type).toBe("done");
    const [row] = insert.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(row).toMatchObject({ diet_md: "# Plan", patient_id: "p1" });
    expect(row).not.toHaveProperty("consultation_summary");
  });

  it("paciente existente: pasa su memoria a la generación", async () => {
    await readEvents(await POST(requestWith(EXISTING)));

    expect(loadPatientMemory).toHaveBeenCalledWith(supabase, "p1");
    expect(streamDietGeneration).toHaveBeenCalledWith({
      transcription: "consulta",
      memory: MEMORY,
    });
  });

  it("paciente existente: no crea otro paciente", async () => {
    const inserts: string[] = [];
    supabase.from.mockImplementation((table: string) =>
      stubTable({
        insert: () => {
          inserts.push(table);
          return stubTable();
        },
      }),
    );

    await readEvents(await POST(requestWith(EXISTING)));

    expect(inserts).toEqual(["patient_consultations"]);
  });

  it("paciente nuevo: la generación no recibe memoria aunque llegue un patientId", async () => {
    await readEvents(
      await POST(requestWith({ ...NEW, patientId: "otro-paciente" })),
    );

    expect(loadPatientMemory).not.toHaveBeenCalled();
    expect(streamDietGeneration).toHaveBeenCalledWith({
      transcription: "consulta",
      memory: null,
    });
  });

  it("paciente nuevo: crea su fila aunque el email ya exista, sin tocar otras", async () => {
    extractConsultationData.mockResolvedValue({
      patient: { name_surnames: "Ana García", mail: "ana@example.com" },
      consultation: {},
    });
    const updates: string[] = [];
    const inserts: string[] = [];
    supabase.from.mockImplementation((table: string) =>
      stubTable({
        update: () => {
          updates.push(table);
          return stubTable();
        },
        insert: () => {
          inserts.push(table);
          return stubTable();
        },
      }),
    );

    const events = await readEvents(await POST(requestWith(NEW)));

    expect(events.at(-1).type).toBe("done");
    expect(inserts).toEqual(["patients", "patient_consultations"]);
    expect(updates).toEqual([]);
  });

  it("paciente nuevo sin nombre extraído: error con qué hacer y nada guardado", async () => {
    extractConsultationData.mockResolvedValue({
      patient: { name_surnames: null },
      consultation: {},
    });
    const insert = vi.fn(() => stubTable());
    supabase.from.mockImplementation(() => stubTable({ insert }));

    const events = await readEvents(await POST(requestWith(NEW)));

    expect(events.at(-1)).toEqual({
      type: "error",
      message: NEW_PATIENT_WITHOUT_NAME_MESSAGE,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rechaza sin transcripción y no llama al modelo", async () => {
    const response = await POST(requestWith({ patientMode: "new" }));

    expect(response.status).toBe(400);
    expect(streamDietGeneration).not.toHaveBeenCalled();
  });

  it.each([
    ["sin modo", { transcription: "consulta" }],
    ["con modo inválido", { transcription: "consulta", patientMode: "maybe" }],
    [
      "existente sin patientId",
      { transcription: "consulta", patientMode: "existing" },
    ],
  ])("rechaza %s con 400 y no llama a ningún modelo", async (_, body) => {
    const response = await POST(requestWith(body));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(streamDietGeneration).not.toHaveBeenCalled();
    expect(extractConsultationData).not.toHaveBeenCalled();
  });

  it("paciente ajeno o inexistente: 404 con qué hacer y ningún modelo", async () => {
    loadPatientMemory.mockResolvedValue(null);

    const response = await POST(requestWith(EXISTING));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: PATIENT_NOT_FOUND_MESSAGE });
    expect(streamDietGeneration).not.toHaveBeenCalled();
    expect(extractConsultationData).not.toHaveBeenCalled();
  });
});
