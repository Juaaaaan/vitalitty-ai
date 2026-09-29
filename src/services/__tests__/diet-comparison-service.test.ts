import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../../../lib/ai/anthropic", () => ({
  default: { messages: { create: createMock } },
}));

import {
  COMPARISON_SCHEMAS,
  buildChangesContent,
  compareDiets,
  diffPortions,
  needsPortions,
  projectPortions,
  reasonSourceOf,
} from "@/services/diet-comparison-service";
import { DIET_PORTIONS_VERSION } from "@/constants/diet-comparison";
import exampleDietPortions from "./fixtures/example-diet-portions.json";
import syntheticDietChanges from "./fixtures/synthetic-diet-changes.json";
import type {
  DietPortions,
  PortionEntry,
} from "@/models/diet-comparison/diet-comparison.models";

function respondWith(payload: unknown) {
  createMock.mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });
}

function entry(overrides: Partial<PortionEntry>): PortionEntry {
  return {
    group: "hidrato_cena",
    label: "Hidrato en cena",
    min: 30,
    max: 30,
    unit: "g",
    alternatives: "",
    ...overrides,
  };
}

const portions = (...groups: PortionEntry[]): DietPortions => ({
  version: DIET_PORTIONS_VERSION,
  groups,
});

/** Cuenta los parámetros con unión de tipos (`type: [...]` o `anyOf`). */
function countUnions(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const record = node as Record<string, unknown>;
  const own = Array.isArray(record.type) || "anyOf" in record ? 1 : 0;
  return (
    own + Object.values(record).reduce<number>((n, v) => n + countUnions(v), 0)
  );
}

describe("projectPortions", () => {
  beforeEach(() => createMock.mockReset());

  it("usa salida estructurada sin marcar caché", async () => {
    respondWith({ groups: [] });

    await projectPortions("# Dieta");

    const request = createMock.mock.calls[0][0];
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.messages).toEqual([{ role: "user", content: "# Dieta" }]);
    expect(JSON.stringify(request)).not.toContain("cache_control");
  });

  it("los schemas no tienen uniones de tipos", () => {
    expect(countUnions(COMPARISON_SCHEMAS.PORTIONS_SCHEMA)).toBe(0);
    expect(countUnions(COMPARISON_SCHEMAS.CHANGES_SCHEMA)).toBe(0);
  });

  it("devuelve un rango como min/max y ordena por grupo", async () => {
    respondWith({
      groups: [
        {
          group: "verdura",
          label: "Cremas",
          min: 150,
          max: 200,
          unit: "ml",
          alternatives: "",
        },
        {
          group: "hidrato_comida",
          label: "Hidrato en comida",
          min: 60,
          max: 60,
          unit: "g",
          alternatives: "o 200 gr de patata",
        },
      ],
    });

    const result = await projectPortions("# Dieta");

    expect(result.version).toBe(DIET_PORTIONS_VERSION);
    expect(result.groups.map((g) => g.group)).toEqual([
      "hidrato_comida",
      "verdura",
    ]);
    expect(result.groups[1]).toMatchObject({ min: 150, max: 200, unit: "ml" });
  });

  it("una sola entrada por grupo: se queda la primera", async () => {
    respondWith({
      groups: [
        {
          group: "proteina",
          label: "Carne roja",
          min: 140,
          max: 140,
          unit: "g",
          alternatives: "",
        },
        {
          group: "proteina",
          label: "Pescado",
          min: 160,
          max: 160,
          unit: "g",
          alternatives: "",
        },
      ],
    });

    const result = await projectPortions("# Dieta");

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBe("Carne roja");
  });

  it("un grupo no pautado no aparece y no se inventan cantidades", async () => {
    respondWith({
      groups: [
        {
          group: "pan",
          label: "Pan",
          min: 0,
          max: 0,
          unit: "g",
          alternatives: "",
        },
      ],
    });

    expect((await projectPortions("# Dieta")).groups).toEqual([]);
  });

  it("una respuesta inválida lanza un error", async () => {
    respondWith({ nada: true });

    await expect(projectPortions("# Dieta")).rejects.toThrow();
  });
});

describe("needsPortions", () => {
  it("sin proyección o con una versión antigua, hay que proyectar", () => {
    expect(needsPortions(null)).toBe(true);
    expect(
      needsPortions({ version: DIET_PORTIONS_VERSION - 1, groups: [] }),
    ).toBe(true);
    expect(needsPortions(portions())).toBe(false);
  });
});

describe("diffPortions", () => {
  it("diferencia con la misma unidad", () => {
    const [row] = diffPortions(
      portions(entry({ min: 30, max: 30 })),
      portions(entry({ min: 20, max: 20 })),
    );

    expect(row.delta).toEqual({ min: -10, max: -10 });
  });

  it("grupo solo en un lado: sin Δ", () => {
    const rows = diffPortions(
      portions(),
      portions(
        entry({ group: "grasas", label: "Frutos secos", min: 10, max: 10 }),
      ),
    );

    expect(rows).toEqual([
      expect.objectContaining({ group: "grasas", previous: null, delta: null }),
    ]);
  });

  it("unidades distintas: sin Δ", () => {
    const [row] = diffPortions(
      portions(entry({ unit: "g" })),
      portions(entry({ unit: "ud", min: 1, max: 1 })),
    );

    expect(row.delta).toBeNull();
  });

  it("rangos: Δ de cada extremo, sin promediar", () => {
    const [row] = diffPortions(
      portions(entry({ group: "verdura", unit: "ml", min: 150, max: 200 })),
      portions(entry({ group: "verdura", unit: "ml", min: 200, max: 250 })),
    );

    expect(row.delta).toEqual({ min: 50, max: 50 });
    expect(row.current).toMatchObject({ min: 200, max: 250 });
  });

  it("sigue el orden fijo de los grupos", () => {
    const rows = diffPortions(
      portions(entry({ group: "pan" }), entry({ group: "hidrato_comida" })),
      null,
    );

    expect(rows.map((r) => r.group)).toEqual(["hidrato_comida", "pan"]);
  });
});

describe("compareDiets", () => {
  beforeEach(() => createMock.mockReset());

  const input = {
    previousVersion: 2,
    currentVersion: 3,
    previousMd: "# Dieta v2",
    currentMd: "# Dieta v3",
    reason: { kind: "transcription" as const, text: "bajamos el hidrato" },
  };

  it("pone las dos dietas y después la consulta, en ese orden", () => {
    const content = buildChangesContent(input);

    const v2 = content.indexOf("# Dieta v2");
    const v3 = content.indexOf("# Dieta v3");
    const reason = content.indexOf("bajamos el hidrato");
    expect(v2).toBeGreaterThan(-1);
    expect(v2).toBeLessThan(v3);
    expect(v3).toBeLessThan(reason);
  });

  it("sin transcripción usa el resumen, y sin nada avisa de que no consta", () => {
    expect(
      buildChangesContent({
        ...input,
        reason: { kind: "summary", text: "resumen v3" },
      }),
    ).toContain("resumen v3");
    expect(
      buildChangesContent({ ...input, reason: { kind: "none" } }),
    ).toContain("el motivo de los cambios no consta");
  });

  it("devuelve listas limpias y el resumen", async () => {
    respondWith({
      added: ["avena", " avena ", ""],
      removed: ["pan blanco"],
      summary: "  Se sustituye el pan blanco por avena.  ",
    });

    const result = await compareDiets(input);

    expect(result).toEqual({
      added: ["avena"],
      removed: ["pan blanco"],
      summary: "Se sustituye el pan blanco por avena.",
    });
    expect(JSON.stringify(createMock.mock.calls[0][0])).not.toContain(
      "cache_control",
    );
  });

  it("sin resumen lanza un error", async () => {
    respondWith({ added: [], removed: [], summary: " " });

    await expect(compareDiets(input)).rejects.toThrow();
  });
});

describe("reasonSourceOf", () => {
  it("prefiere la transcripción, luego el resumen, luego nada", () => {
    expect(
      reasonSourceOf({ audio_transcription: "t", consultation_summary: "s" }),
    ).toEqual({
      kind: "transcription",
      text: "t",
    });
    expect(
      reasonSourceOf({ audio_transcription: " ", consultation_summary: "s" }),
    ).toEqual({
      kind: "summary",
      text: "s",
    });
    expect(reasonSourceOf({})).toEqual({ kind: "none" });
  });
});

describe("proyección real de la dieta de ejemplo (fixture grabada)", () => {
  // Salida real del modelo con DIET_EXAMPLES[0], grabada una vez. Si el prompt
  // cambia, se vuelve a grabar y se revisa a mano antes de sustituirla.
  beforeEach(() => createMock.mockReset());

  it("hidrato en comida 60 g con la patata como alternativa, cremas 150-200 ml, proteína sin rango falso", async () => {
    respondWith(exampleDietPortions);

    const { groups } = await projectPortions("# Dieta de ejemplo");
    const byGroup = Object.fromEntries(groups.map((g) => [g.group, g]));

    expect(byGroup.hidrato_comida).toMatchObject({
      min: 60,
      max: 60,
      unit: "g",
    });
    expect(byGroup.hidrato_comida.alternatives).toMatch(/200 gr de patata/);
    expect(byGroup.verdura).toMatchObject({ min: 150, max: 200, unit: "ml" });
    expect(byGroup.proteina).toMatchObject({ min: 140, max: 140 });
    expect(byGroup.proteina.alternatives).toMatch(/160 gr de pescado/);
  });
});

describe("comparación real de dos dietas sintéticas (fixture grabada)", () => {
  // Salidas reales del modelo, grabadas una vez: v2 con pan blanco y yogur
  // natural, v3 con avena, yogur natural sin azúcar y menos hidrato en cena.
  // Primero con una transcripción que da los motivos, luego sin motivos.
  beforeEach(() => createMock.mockReset());

  const input = {
    previousVersion: 2,
    currentVersion: 3,
    previousMd: "# v2",
    currentMd: "# v3",
    reason: { kind: "transcription" as const, text: "..." },
  };

  it("empareja sinónimos y marca lo que de verdad entra y sale", async () => {
    respondWith(syntheticDietChanges.withReason);

    const { added, removed } = await compareDiets(input);

    expect(added).toContain("copos de avena");
    expect(removed).toContain("pan blanco");
    expect([...added, ...removed].some((food) => food.includes("yogur"))).toBe(
      false,
    );
  });

  it("con motivo dicho en consulta, el resumen lo cita", async () => {
    respondWith(syntheticDietChanges.withReason);

    const { summary } = await compareDiets(input);

    expect(summary).toMatch(/hinchazón/);
    expect(summary).toMatch(/pérdida de peso/);
  });

  it("sin motivo dicho en consulta, el resumen dice que no consta", async () => {
    respondWith(syntheticDietChanges.withoutReason);

    const { summary } = await compareDiets(input);

    expect(summary).toMatch(/no consta el motivo/);
  });
});
