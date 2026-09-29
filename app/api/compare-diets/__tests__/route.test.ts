import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { compareDiets, projectPortions, createClient, supabase } = vi.hoisted(
  () => {
    const supabase = { auth: { getUser: vi.fn() }, from: vi.fn() };
    return {
      compareDiets: vi.fn(),
      projectPortions: vi.fn(),
      createClient: vi.fn(async () => supabase),
      supabase,
    };
  },
);

vi.mock("@/services/diet-comparison-service", async (importActual) => ({
  ...(await importActual<object>()),
  compareDiets,
  projectPortions,
}));
vi.mock("../../../../lib/supabase/server", () => ({ createClient }));
// El servicio real se importa en parte: su cliente no debe crearse en jsdom.
vi.mock("../../../../lib/ai/anthropic", () => ({ default: {} }));

import { POST } from "../route";
import {
  CONSULTATION_NOT_FOUND_MESSAGE,
  COMPARISON_FAILED_MESSAGE,
  DIET_CHANGES_VERSION,
  DIET_PORTIONS_VERSION,
  FIRST_DIET_MESSAGE,
} from "@/constants/diet-comparison";

const portions = (min: number) => ({
  version: DIET_PORTIONS_VERSION,
  groups: [
    {
      group: "hidrato_cena",
      label: "Hidrato en cena",
      min,
      max: min,
      unit: "g",
      alternatives: "",
    },
  ],
});

const V2 = {
  id: "c2",
  patient_id: "p1",
  diet_version: 2,
  created_at: "2026-02-01T10:00:00Z",
  diet_md: "# v2",
  diet_portions: portions(30),
  diet_changes: null,
  audio_transcription: "t2",
  consultation_summary: null,
  objetivo_calorias: 2100,
  weight: 82,
};

const V3 = {
  ...V2,
  id: "c3",
  diet_version: 3,
  created_at: "2026-03-01T10:00:00Z",
  diet_md: "# v3",
  diet_portions: portions(20),
  audio_transcription: "bajamos el hidrato de la cena",
  objetivo_calorias: 1900,
  weight: "80.5",
};

const CHANGES = {
  added: ["avena"],
  removed: ["pan blanco"],
  summary: "Se baja el hidrato de la cena.",
};

/**
 * Supabase encadenable. Las lecturas `maybeSingle` salen de `reads` en orden
 * (primero la consulta N, luego la anterior); los `update` se registran.
 */
function stubDb(reads: unknown[]) {
  const updates: Array<{ row: Record<string, unknown>; id: unknown }> = [];
  const queue = [...reads];
  supabase.from.mockImplementation(() => {
    let pendingUpdate: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        if (pendingUpdate && column === "id") {
          updates.push({ row: pendingUpdate, id: value });
          return Promise.resolve({ error: null });
        }
        return chain;
      },
      lt: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      update: (row: Record<string, unknown>) => {
        pendingUpdate = row;
        return chain;
      },
      maybeSingle: async () => ({ data: queue.shift() ?? null, error: null }),
    };
    return chain;
  });
  return updates;
}

function requestWith(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/compare-diets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    compareDiets.mockResolvedValue(CHANGES);
  });

  it("calcula la comparación, la guarda en la fila N y devuelve las diferencias", async () => {
    const updates = stubDb([{ ...V3 }, { ...V2 }]);

    const response = await POST(requestWith({ consultationId: "c3" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(compareDiets).toHaveBeenCalledWith(
      expect.objectContaining({
        previousVersion: 2,
        currentVersion: 3,
        previousMd: "# v2",
        currentMd: "# v3",
        reason: {
          kind: "transcription",
          text: "bajamos el hidrato de la cena",
        },
      }),
    );
    expect(body.previous).toMatchObject({
      dietVersion: 2,
      calories: 2100,
      weight: 82,
    });
    expect(body.current).toMatchObject({
      dietVersion: 3,
      calories: 1900,
      weight: 80.5,
    });
    expect(body.portions).toEqual([
      expect.objectContaining({
        group: "hidrato_cena",
        delta: { min: -10, max: -10 },
      }),
    ]);
    expect(body).toMatchObject(CHANGES);
    expect(updates).toEqual([
      {
        id: "c3",
        row: {
          diet_changes: expect.objectContaining({
            version: DIET_CHANGES_VERSION,
            previousConsultationId: "c2",
            ...CHANGES,
          }),
        },
      },
    ]);
  });

  it("reutiliza la comparación guardada sin llamar al modelo", async () => {
    const cached = {
      version: DIET_CHANGES_VERSION,
      previousConsultationId: "c2",
      ...CHANGES,
      createdAt: "2026-03-01T11:00:00Z",
    };
    const updates = stubDb([{ ...V3, diet_changes: cached }, { ...V2 }]);

    const response = await POST(requestWith({ consultationId: "c3" }));

    expect(response.status).toBe(200);
    expect(compareDiets).not.toHaveBeenCalled();
    expect(projectPortions).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("recalcula si la versión anterior ya no es la misma consulta", async () => {
    const stale = {
      version: DIET_CHANGES_VERSION,
      previousConsultationId: "c2-borrada",
      ...CHANGES,
      createdAt: "2026-03-01T11:00:00Z",
    };
    stubDb([{ ...V3, diet_changes: stale }, { ...V2 }]);

    await POST(requestWith({ consultationId: "c3" }));

    expect(compareDiets).toHaveBeenCalledTimes(1);
  });

  it("salta versiones borradas: compara con la anterior existente", async () => {
    stubDb([{ ...V3, diet_version: 5 }, { ...V2 }]);

    const body = await (
      await POST(requestWith({ consultationId: "c3" }))
    ).json();

    expect(body.previous.dietVersion).toBe(2);
    expect(compareDiets).toHaveBeenCalledWith(
      expect.objectContaining({ previousVersion: 2, currentVersion: 5 }),
    );
  });

  it("proyecta las raciones que falten antes de comparar", async () => {
    projectPortions.mockResolvedValue(portions(30));
    const updates = stubDb([{ ...V3 }, { ...V2, diet_portions: null }]);

    const body = await (
      await POST(requestWith({ consultationId: "c3" }))
    ).json();

    expect(projectPortions).toHaveBeenCalledWith("# v2");
    expect(updates).toContainEqual({
      id: "c2",
      row: { diet_portions: portions(30) },
    });
    expect(body.portions[0].delta).toEqual({ min: -10, max: -10 });
  });

  it("400 sin consultationId y ningún modelo", async () => {
    const response = await POST(requestWith({}));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(compareDiets).not.toHaveBeenCalled();
  });

  it("404 si la consulta es ajena, no existe o no tiene dieta", async () => {
    for (const current of [null, { ...V3, diet_md: null }]) {
      stubDb([current]);

      const response = await POST(requestWith({ consultationId: "c3" }));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: CONSULTATION_NOT_FOUND_MESSAGE,
      });
    }
    expect(compareDiets).not.toHaveBeenCalled();
  });

  it("409 con la primera dieta del paciente, sin ningún cálculo", async () => {
    stubDb([{ ...V2, diet_version: 1 }, null]);

    const response = await POST(requestWith({ consultationId: "c2" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: FIRST_DIET_MESSAGE });
    expect(compareDiets).not.toHaveBeenCalled();
    expect(projectPortions).not.toHaveBeenCalled();
  });

  it("500 con qué hacer si falla el modelo, sin guardar nada", async () => {
    compareDiets.mockRejectedValue(new Error("haiku cayó"));
    const updates = stubDb([{ ...V3 }, { ...V2 }]);

    const response = await POST(requestWith({ consultationId: "c3" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: COMPARISON_FAILED_MESSAGE });
    expect(updates).toEqual([]);
  });
});
