import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIET_CHANGES_VERSION } from "@/constants/diet-comparison";
import { loadComparison } from "@/services/diet-comparison-store";
import type { ComparisonRow } from "@/services/diet-comparison-store";

// El cliente del modelo se sustituye antes de importar el servicio: cargarlo
// de verdad revienta en jsdom, y estas pruebas no llaman al modelo.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../../../lib/ai/anthropic", () => ({
  default: { messages: { create: createMock } },
}));

const compareDiets = vi.hoisted(() => vi.fn());

vi.mock("@/services/diet-comparison-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/diet-comparison-service")
  >("@/services/diet-comparison-service");

  return { ...actual, compareDiets, projectPortions: vi.fn() };
});

const PORTIONS = {
  version: 1,
  groups: [
    {
      group: "proteina" as const,
      label: "Proteína",
      min: 150,
      max: 150,
      unit: "g" as const,
      alternatives: "",
    },
  ],
};

function row(overrides: Partial<ComparisonRow>): ComparisonRow {
  return {
    id: "c2",
    patient_id: "p1",
    diet_version: 2,
    created_at: "2026-09-20T10:00:00Z",
    diet_md: "---\npaciente: Rubén\n---\n",
    diet_portions: PORTIONS,
    diet_changes: null,
    audio_transcription: "se baja el hidrato de la cena",
    consultation_summary: null,
    objetivo_calorias: 2000,
    weight: 80,
    ...overrides,
  };
}

/**
 * Cliente falso: `select` devuelve la fila que toque según el filtro (por `id`
 * es la consulta N, por `patient_id` es la anterior) y `update` se registra.
 */
function fakeSupabase(
  current: ComparisonRow | null,
  previous: ComparisonRow | null,
) {
  const updates: Record<string, unknown>[] = [];

  const supabase = {
    from: () => {
      let byId = false;

      const builder = {
        select: () => builder,
        eq: (column: string) => {
          if (column === "id") byId = true;
          return builder;
        },
        lt: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({
          data: byId ? current : previous,
          error: null,
        }),
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          return builder;
        },
      };

      return builder;
    },
  } as unknown as SupabaseClient;

  return { supabase, updates };
}

beforeEach(() => {
  compareDiets.mockReset();
  compareDiets.mockResolvedValue({
    added: ["avena"],
    removed: ["pan blanco"],
    summary: "Se baja el hidrato de la cena.",
    reasonSource: "transcription",
  });
});

describe("loadComparison", () => {
  it("compara N con la versión anterior y guarda el resultado", async () => {
    const { supabase, updates } = fakeSupabase(
      row({}),
      row({ id: "c1", diet_version: 1, objetivo_calorias: 2200, weight: 82 }),
    );

    const result = await loadComparison(supabase, "c2");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.comparison.previous.dietVersion).toBe(1);
    expect(result.comparison.current.dietVersion).toBe(2);
    expect(result.comparison.previous.calories).toBe(2200);
    expect(result.comparison.added).toEqual(["avena"]);
    expect(compareDiets).toHaveBeenCalledTimes(1);

    // Se guarda en la fila N, apuntando a la anterior con la que se comparó.
    expect(updates).toHaveLength(1);
    expect(updates[0].diet_changes).toMatchObject({
      version: DIET_CHANGES_VERSION,
      previousConsultationId: "c1",
    });
  });

  it("reutiliza la comparación guardada sin llamar al modelo", async () => {
    const cached = {
      version: DIET_CHANGES_VERSION,
      previousConsultationId: "c1",
      added: ["kéfir"],
      removed: [],
      summary: "Entra el kéfir.",
      reasonSource: "transcription" as const,
      createdAt: "2026-09-21T10:00:00Z",
    };
    const { supabase, updates } = fakeSupabase(
      row({ diet_changes: cached }),
      row({ id: "c1", diet_version: 1 }),
    );

    const result = await loadComparison(supabase, "c2");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comparison.added).toEqual(["kéfir"]);
    expect(compareDiets).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("descarta lo guardado si la versión anterior ya no es la misma", async () => {
    const stale = {
      version: DIET_CHANGES_VERSION,
      previousConsultationId: "borrada",
      added: ["kéfir"],
      removed: [],
      summary: "Entra el kéfir.",
      reasonSource: "transcription" as const,
      createdAt: "2026-09-21T10:00:00Z",
    };
    const { supabase } = fakeSupabase(
      row({ diet_changes: stale }),
      row({ id: "c1", diet_version: 1 }),
    );

    const result = await loadComparison(supabase, "c2");

    expect(result.ok).toBe(true);
    expect(compareDiets).toHaveBeenCalledTimes(1);
  });

  it("una consulta ajena, inexistente o sin dieta es no encontrada", async () => {
    const { supabase } = fakeSupabase(null, null);

    await expect(loadComparison(supabase, "ajena")).resolves.toEqual({
      ok: false,
      failure: "not_found",
    });

    const withoutDiet = fakeSupabase(
      row({ diet_md: null as unknown as string }),
      null,
    );
    await expect(loadComparison(withoutDiet.supabase, "c2")).resolves.toEqual({
      ok: false,
      failure: "not_found",
    });

    expect(compareDiets).not.toHaveBeenCalled();
  });

  it("la primera dieta de un paciente no tiene anterior", async () => {
    const { supabase } = fakeSupabase(row({ id: "c1", diet_version: 1 }), null);

    await expect(loadComparison(supabase, "c1")).resolves.toEqual({
      ok: false,
      failure: "first_diet",
    });
    expect(compareDiets).not.toHaveBeenCalled();
  });
});
