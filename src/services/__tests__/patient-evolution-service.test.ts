import { describe, expect, it } from "vitest";
import {
  buildEvolutionData,
  buildPortionsSeries,
} from "../patient-evolution-service";
import type {
  PortionEntry,
  PortionGroup,
} from "@/models/diet-comparison/diet-comparison.models";

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

describe("buildPortionsSeries", () => {
  const entry = (
    group: PortionGroup,
    min: number,
    max = min,
  ): PortionEntry => ({
    group,
    label: group,
    min,
    max,
    unit: group === "verdura" ? "ml" : "g",
    alternatives: "",
  });
  const diet = (dietVersion: number, ...groups: PortionEntry[]) => ({
    dietVersion,
    createdAt: `2026-0${dietVersion}-01T10:00:00Z`,
    portions: { version: 1, groups },
  });

  it("un punto por dieta en orden de versión", () => {
    const series = buildPortionsSeries([
      diet(2, entry("hidrato_cena", 20)),
      diet(1, entry("hidrato_cena", 30)),
    ]);

    expect(series.points.map((p) => p.hidrato_cena__g)).toEqual([30, 20]);
    expect(series.points[0].label).toMatch(/^v1 · /);
  });

  it("rango: el punto va en el centro y el rango se conserva", () => {
    const series = buildPortionsSeries([diet(1, entry("verdura", 150, 200))]);

    expect(series.points[0].verdura__ml).toBe(175);
    expect(series.entries[0].verdura__ml).toMatchObject({
      min: 150,
      max: 200,
      unit: "ml",
    });
  });

  it("grupo que una dieta no pauta: sin punto en esa dieta", () => {
    const series = buildPortionsSeries([
      diet(1, entry("hidrato_cena", 30)),
      diet(2, entry("hidrato_cena", 20), entry("grasas", 10)),
    ]);

    expect(series.points[0]).not.toHaveProperty("grasas__g");
    expect(series.points[1].grasas__g).toBe(10);
    expect(series.lines.map((l) => l.group)).toEqual([
      "hidrato_cena",
      "grasas",
    ]);
  });

  it("sin dietas: serie vacía", () => {
    expect(buildPortionsSeries([])).toEqual({
      points: [],
      lines: [],
      entries: [],
    });
  });

  it("mismo grupo en otra unidad: otra línea, nunca unida a la primera", () => {
    const series = buildPortionsSeries([
      diet(1, { ...entry("pan", 2), unit: "ud" }),
      diet(2, entry("pan", 40)),
    ]);

    expect(series.lines.map((l) => [l.key, l.unit])).toEqual([
      ["pan__g", "g"],
      ["pan__ud", "ud"],
    ]);
    expect(series.points[0]).toMatchObject({ pan__ud: 2 });
    expect(series.points[0]).not.toHaveProperty("pan__g");
    expect(series.points[1]).toMatchObject({ pan__g: 40 });
  });
});
