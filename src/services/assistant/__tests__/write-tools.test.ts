import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/ai/anthropic", () => ({
  default: { messages: { create: vi.fn(), stream: vi.fn() } },
}));

// El render carga Chromium: aquí solo interesa que se llame con lo correcto.
const renderAndStoreDietPdf = vi.hoisted(() => vi.fn());
vi.mock("@/services/diet-pdf-store", () => ({ renderAndStoreDietPdf }));
vi.mock("@/services/diet-pdf-service", () => ({
  UnstructuredDietError: class extends Error {},
}));

const streamDietGeneration = vi.hoisted(() => vi.fn());
vi.mock("@/services/diet-generation-service", () => ({ streamDietGeneration }));

import { WRITE_TOOLS } from "@/services/assistant/write-tools";
import { ToolNotFoundError } from "@/models/assistant/assistant.models";
import type { AssistantToolContext } from "@/models/assistant/assistant.models";
import { fakeSupabase } from "./fake-supabase";

const PATIENTS = [
  { id: "p1", name_surnames: "Rubén Díaz", age: 34, height: 178, weight: 80 },
];

const CONSULTATIONS = [
  {
    id: "c1",
    patient_id: "p1",
    created_at: "2026-09-01T10:00:00Z",
    diet_version: 1,
    diet_md: "# v1",
    consultation_summary: "Primera pauta",
  },
];

function context() {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const supabase = fakeSupabase(
    {
      patients: [...PATIENTS],
      patient_consultations: CONSULTATIONS.map((row) => ({ ...row })),
    },
    inserts,
  );

  return { ctx: { supabase, userId: "u1" } as AssistantToolContext, inserts };
}

beforeEach(() => {
  streamDietGeneration.mockReset();
  renderAndStoreDietPdf.mockReset();

  streamDietGeneration.mockImplementation(async function* () {
    yield { type: "text", text: "---\npaciente: Rubén\n---\n" };
    yield { type: "text", text: "## Objetivos\n" };
  });
});

describe("generar_dieta", () => {
  it("guarda una versión nueva, sin transcripción, y devuelve el documento", async () => {
    const { ctx, inserts } = context();

    const result = (await WRITE_TOOLS.generar_dieta(ctx, {
      paciente_id: "p1",
      instrucciones: "sube el hidrato de la cena",
    })) as { version: number; documento: string };

    expect(result.version).toBe(2);
    expect(result.documento).toContain("## Objetivos");

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("patient_consultations");
    expect(inserts[0].values).toMatchObject({
      patient_id: "p1",
      created_by: "u1",
    });
    // No hubo consulta grabada: no se inventa una transcripción.
    expect(inserts[0].values.audio_transcription).toBeUndefined();

    // La generación recibe la instrucción, no una transcripción.
    expect(streamDietGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: "sube el hidrato de la cena" }),
    );
  });

  it("la dieta anterior sigue existiendo", async () => {
    const { ctx } = context();

    await WRITE_TOOLS.generar_dieta(ctx, {
      paciente_id: "p1",
      instrucciones: "quita el kéfir",
    });

    const { data } = (await ctx.supabase
      .from("patient_consultations")
      .select("id, diet_version")
      .eq("patient_id", "p1")) as unknown as {
      data: Array<{ diet_version: number }>;
    };

    expect(data.map((row) => row.diet_version).sort()).toEqual([1, 2]);
  });

  it("un paciente ajeno o inexistente no genera nada", async () => {
    const { ctx, inserts } = context();

    await expect(
      WRITE_TOOLS.generar_dieta(ctx, {
        paciente_id: "de-otro",
        instrucciones: "lo que sea",
      }),
    ).rejects.toBeInstanceOf(ToolNotFoundError);

    expect(inserts).toHaveLength(0);
    expect(streamDietGeneration).not.toHaveBeenCalled();
  });

  it("un documento vacío no se guarda", async () => {
    streamDietGeneration.mockImplementation(async function* () {
      yield { type: "text", text: "   " };
    });
    const { ctx, inserts } = context();

    await expect(
      WRITE_TOOLS.generar_dieta(ctx, {
        paciente_id: "p1",
        instrucciones: "sube la proteína",
      }),
    ).rejects.toThrow(/empty/);
    expect(inserts).toHaveLength(0);
  });
});
