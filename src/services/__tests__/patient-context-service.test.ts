import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPatientMemory,
  CONSULTATION_MEMORY_COLUMNS,
  loadPatientMemory,
} from "@/services/patient-context-service";
import type { ConsultationMemoryRow } from "@/models/patient-context/patient-memory.models";

const PERSONAL = {
  name_surnames: "Laura Martín",
  age: 34,
  gender: "F",
  height: 165,
  weight: 62,
};

function row(overrides: Partial<ConsultationMemoryRow>): ConsultationMemoryRow {
  return {
    created_at: "2026-09-01T10:00:00Z",
    diet_version: 1,
    consultation_summary: null,
    ...overrides,
  };
}

describe("buildPatientMemory", () => {
  it("el valor más reciente gana", () => {
    const memory = buildPatientMemory(
      PERSONAL,
      [
        row({ alimentos_evitar: ["marisco"], diet_version: 2 }),
        row({ alimentos_evitar: ["pescado azul"], diet_version: 1 }),
      ],
      null,
    );

    expect(memory.clinical.alimentos_evitar).toEqual(["marisco"]);
  });

  it("conserva de una consulta anterior un dato que la última no repitió", () => {
    const memory = buildPatientMemory(
      PERSONAL,
      [
        row({ alergias_intolerancias: undefined, diet_version: 2 }),
        row({ alergias_intolerancias: ["lactosa"], diet_version: 1 }),
      ],
      null,
    );

    expect(memory.clinical.alergias_intolerancias).toEqual(["lactosa"]);
  });

  it("trata listas y textos vacíos como desconocidos", () => {
    const memory = buildPatientMemory(
      PERSONAL,
      [
        row({ patologias: [], medicacion: "  ", diet_version: 2 }),
        row({ patologias: ["hipotiroidismo"], diet_version: 1 }),
      ],
      null,
    );

    expect(memory.clinical.patologias).toEqual(["hipotiroidismo"]);
    expect(memory.clinical).not.toHaveProperty("medicacion");
  });

  it("omite los datos que ninguna consulta registró", () => {
    const memory = buildPatientMemory(PERSONAL, [row({})], null);

    expect(memory.clinical).toEqual({});
  });

  it("incluye como mucho 3 resúmenes, de las consultas con dieta más recientes", () => {
    const consultations = [5, 4, 3, 2, 1].map((version) =>
      row({
        diet_version: version,
        created_at: `2026-09-0${version}T10:00:00Z`,
        consultation_summary: `Resumen v${version}`,
      }),
    );

    const memory = buildPatientMemory(PERSONAL, consultations, null);

    expect(memory.summaries.map((summary) => summary.summary)).toEqual([
      "Resumen v5",
      "Resumen v4",
      "Resumen v3",
    ]);
    expect(memory.summaries[0]).toEqual({
      version: 5,
      date: "2026-09-05",
      summary: "Resumen v5",
    });
  });

  it("omite las consultas sin resumen sin fallar", () => {
    const memory = buildPatientMemory(
      PERSONAL,
      [
        row({ diet_version: 3, consultation_summary: "Resumen v3" }),
        row({ diet_version: 2, consultation_summary: null }),
        row({ diet_version: 1, consultation_summary: "Resumen v1" }),
      ],
      null,
    );

    expect(memory.summaries.map((summary) => summary.version)).toEqual([3, 1]);
  });

  it("ignora como resumen las consultas sin dieta", () => {
    const memory = buildPatientMemory(
      PERSONAL,
      [row({ diet_version: null, consultation_summary: "Sin dieta" })],
      null,
    );

    expect(memory.summaries).toEqual([]);
  });

  it("lleva la última dieta completa y ninguna transcripción", () => {
    const memory = buildPatientMemory(
      PERSONAL,
      [
        {
          ...row({ diet_version: 1 }),
          audio_transcription: "transcripción antigua",
        } as ConsultationMemoryRow,
      ],
      "# Dieta v1",
    );

    expect(memory.lastDietMd).toBe("# Dieta v1");
    expect(JSON.stringify(memory)).not.toContain("transcripción antigua");
  });
});

/** Cliente Supabase simulado que registra qué columnas pide cada lectura. */
function fakeSupabase(results: {
  patient: unknown;
  consultations?: unknown[];
  lastDiet?: unknown;
}) {
  const selects: { table: string; columns: string }[] = [];
  let consultationReads = 0;

  const from = vi.fn((table: string) => {
    let columns = "";
    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        columns = cols;
        selects.push({ table, columns: cols });
        return chain;
      },
      eq: () => chain,
      not: () => chain,
      limit: () => chain,
      order: () => {
        if (table === "patient_consultations" && columns !== "diet_md") {
          consultationReads += 1;
          return Promise.resolve({
            data: results.consultations ?? [],
            error: null,
          });
        }
        return chain;
      },
      maybeSingle: async () => ({
        data: table === "patients" ? results.patient : results.lastDiet,
        error: null,
      }),
    };
    return chain;
  });

  return {
    client: { from } as unknown as SupabaseClient,
    selects,
    consultationReads: () => consultationReads,
  };
}

describe("loadPatientMemory", () => {
  it("pide solo columnas ligeras en la lectura de consultas", async () => {
    const fake = fakeSupabase({ patient: PERSONAL, consultations: [] });

    await loadPatientMemory(fake.client, "patient-1");

    const consultationsSelect = fake.selects.find(
      (select) =>
        select.table === "patient_consultations" &&
        select.columns !== "diet_md",
    );
    expect(consultationsSelect?.columns).toBe(CONSULTATION_MEMORY_COLUMNS);
    expect(CONSULTATION_MEMORY_COLUMNS).not.toContain("diet_md");
    expect(CONSULTATION_MEMORY_COLUMNS).not.toContain("audio_transcription");
  });

  it("devuelve null si el paciente no existe o no es del usuario", async () => {
    const fake = fakeSupabase({ patient: null });

    await expect(loadPatientMemory(fake.client, "ajeno")).resolves.toBeNull();
  });

  it("monta la memoria con la ficha, los resúmenes y la última dieta", async () => {
    const fake = fakeSupabase({
      patient: PERSONAL,
      consultations: [
        row({
          diet_version: 1,
          alergias_intolerancias: ["lactosa"],
          consultation_summary: "Primera consulta.",
        }),
      ],
      lastDiet: { diet_md: "# Dieta v1" },
    });

    const memory = await loadPatientMemory(fake.client, "patient-1");

    expect(memory).toEqual({
      personal: PERSONAL,
      clinical: { alergias_intolerancias: ["lactosa"] },
      summaries: [
        { version: 1, date: "2026-09-01", summary: "Primera consulta." },
      ],
      lastDietMd: "# Dieta v1",
    });
  });
});
