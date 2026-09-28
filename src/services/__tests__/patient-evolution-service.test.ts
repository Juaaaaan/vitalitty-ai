import { describe, expect, it } from "vitest";
import { buildEvolutionData } from "../patient-evolution-service";

describe("buildEvolutionData", () => {
  it("un punto por consulta con kcal y peso, en orden cronológico", () => {
    const data = buildEvolutionData([
      {
        created_at: "2026-03-01T10:00:00Z",
        objetivo_calorias: 1900,
        weight: 80.5,
      },
      {
        created_at: "2026-01-01T10:00:00Z",
        objetivo_calorias: 2100,
        weight: 82,
      },
    ]);

    expect(data.map(({ calorias, peso }) => ({ calorias, peso }))).toEqual([
      { calorias: 2100, peso: 82 },
      { calorias: 1900, peso: 80.5 },
    ]);
    expect(data[0].label).toMatch(/^C1 · /);
    expect(data[1].label).toMatch(/^C2 · /);
  });

  it("consulta sin peso: peso null, no se copia el de otra", () => {
    const data = buildEvolutionData([
      {
        created_at: "2026-01-01T10:00:00Z",
        objetivo_calorias: 2100,
        weight: 82,
      },
      {
        created_at: "2026-02-01T10:00:00Z",
        objetivo_calorias: 2000,
        weight: null,
      },
    ]);

    expect(data[1]).toMatchObject({ calorias: 2000, peso: null });
  });

  it("consulta sin kcal: calorías null y su peso se conserva", () => {
    const data = buildEvolutionData([
      { created_at: "2026-01-01T10:00:00Z", weight: 82 },
    ]);

    expect(data).toEqual([
      expect.objectContaining({ calorias: null, peso: 82 }),
    ]);
  });

  it("excluye consultas sin kcal ni peso sin renumerar las demás", () => {
    const data = buildEvolutionData([
      { created_at: "2026-01-01T10:00:00Z", objetivo_calorias: 2100 },
      { created_at: "2026-02-01T10:00:00Z" },
      { created_at: "2026-03-01T10:00:00Z", weight: 80 },
    ]);

    expect(data).toHaveLength(2);
    expect(data[1].label).toMatch(/^C3 · /);
  });

  it("lista vacía o sin datos: vacío", () => {
    expect(buildEvolutionData([])).toEqual([]);
    expect(
      buildEvolutionData([{ created_at: "2026-01-01T10:00:00Z" }]),
    ).toEqual([]);
  });
});
