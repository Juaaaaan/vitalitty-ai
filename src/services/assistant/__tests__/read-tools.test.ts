import { beforeEach, describe, expect, it, vi } from "vitest";

// El cliente del modelo se sustituye antes de importar nada que lo arrastre.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("../../../../lib/ai/anthropic", () => ({
  default: { messages: { create: createMock } },
}));

const loadComparison = vi.hoisted(() => vi.fn());
vi.mock("@/services/diet-comparison-store", () => ({ loadComparison }));

import { READ_TOOLS } from "@/services/assistant/read-tools";
import {
  ToolInputError,
  ToolNotFoundError,
  type AssistantToolContext,
} from "@/models/assistant/assistant.models";
import { fakeSupabase } from "./fake-supabase";

const PATIENTS = [
  {
    id: "p1",
    name_surnames: "Rubén Díaz",
    mail: "ruben@example.com",
    phone: "600111222",
    age: 34,
    gender: "M",
    height: 178,
    weight: 80,
  },
  {
    id: "p2",
    name_surnames: "Rubén Díaz",
    mail: "ruben.d@example.com",
    phone: "600333444",
    age: 41,
    gender: "M",
    height: 180,
    weight: 88,
  },
  {
    id: "p3",
    name_surnames: "Laura Martín",
    mail: "laura@example.com",
    phone: "600555666",
    age: 29,
    gender: "F",
    height: 165,
    weight: 62,
  },
];

const CONSULTATIONS = [
  {
    id: "c1",
    patient_id: "p1",
    created_at: "2026-07-01T10:00:00Z",
    diet_version: 1,
    diet_md: "# v1",
    objetivo_calorias: 2200,
    weight: 82,
    pdf_path: null,
    diet_portions: null,
    consultation_summary: "Primera pauta",
  },
  {
    id: "c2",
    patient_id: "p1",
    created_at: "2026-09-01T10:00:00Z",
    diet_version: 2,
    diet_md: "# v2",
    objetivo_calorias: 2000,
    weight: 80,
    pdf_path: "u/p1/c2.pdf",
    diet_portions: null,
    consultation_summary: "Se baja el hidrato",
  },
  {
    id: "c3",
    patient_id: "p3",
    created_at: "2026-09-10T10:00:00Z",
    diet_version: null,
    diet_md: null,
    objetivo_calorias: null,
    weight: null,
    pdf_path: null,
    diet_portions: null,
    consultation_summary: null,
  },
];

function context(tables?: Record<string, Record<string, unknown>[]>) {
  return {
    supabase: fakeSupabase(
      tables ?? {
        patients: PATIENTS,
        patient_consultations: CONSULTATIONS,
        appointments: [],
      },
    ),
    userId: "u1",
  } as AssistantToolContext;
}

const run = (tool: string, input: unknown, ctx = context()) =>
  READ_TOOLS[tool](ctx, input);

beforeEach(() => {
  createMock.mockReset();
  loadComparison.mockReset();
});

describe("buscar_paciente", () => {
  it("encuentra por nombre y devuelve con qué distinguirlos", async () => {
    const result = (await run("buscar_paciente", { texto: "Rubén" })) as {
      pacientes: Array<{ id: string; correo: string; telefono: string }>;
    };

    expect(result.pacientes).toHaveLength(2);
    expect(result.pacientes[0].correo).toBeTruthy();
    expect(result.pacientes[0].telefono).toBeTruthy();
  });

  it("encuentra por correo", async () => {
    const result = (await run("buscar_paciente", {
      texto: "laura@example.com",
    })) as { pacientes: Array<{ id: string }> };

    expect(result.pacientes.map((p) => p.id)).toEqual(["p3"]);
  });

  it("sin coincidencias devuelve la lista vacía", async () => {
    const result = (await run("buscar_paciente", { texto: "Nadie" })) as {
      pacientes: unknown[];
    };

    expect(result.pacientes).toEqual([]);
  });

  it("un texto vacío es un error de argumentos", async () => {
    await expect(
      run("buscar_paciente", { texto: "  " }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("get_paciente", () => {
  it("devuelve ficha y resúmenes, nunca el documento de dieta", async () => {
    const result = (await run("get_paciente", { paciente_id: "p1" })) as {
      paciente: { name_surnames: string };
      consultas_recientes: Array<{ version: number }>;
    };

    expect(result.paciente.name_surnames).toBe("Rubén Díaz");
    expect(result.consultas_recientes).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("# v2");
  });

  it("un paciente ajeno o inexistente es no encontrado", async () => {
    await expect(
      run("get_paciente", { paciente_id: "de-otro" }),
    ).rejects.toBeInstanceOf(ToolNotFoundError);
  });
});

describe("get_dietas", () => {
  it("por defecto devuelve la última con su documento", async () => {
    const result = (await run("get_dietas", { paciente_id: "p1" })) as {
      dietas: Array<{
        version: number;
        documento?: string;
        tiene_pdf: boolean;
      }>;
    };

    expect(result.dietas).toHaveLength(1);
    expect(result.dietas[0].version).toBe(2);
    expect(result.dietas[0].documento).toBe("# v2");
    expect(result.dietas[0].tiene_pdf).toBe(true);
  });

  it("muchas versiones vienen sin documento", async () => {
    const result = (await run("get_dietas", {
      paciente_id: "p1",
      n: 5,
    })) as { dietas: Array<{ version: number; documento?: string }> };

    expect(result.dietas.map((d) => d.version)).toEqual([2, 1]);
    expect(result.dietas[0].documento).toBeUndefined();
  });

  it("un paciente sin dietas devuelve lista vacía", async () => {
    const result = (await run("get_dietas", { paciente_id: "p3" })) as {
      dietas: unknown[];
    };

    expect(result.dietas).toEqual([]);
  });

  it("n fuera de rango es un error de argumentos", async () => {
    await expect(
      run("get_dietas", { paciente_id: "p1", n: 99 }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("estadisticas_paciente", () => {
  it("un punto por consulta, con los valores ausentes en null", async () => {
    const result = (await run("estadisticas_paciente", {
      paciente_id: "p1",
    })) as {
      puntos: Array<{
        fecha: string;
        calorias: number | null;
        peso: number | null;
      }>;
      aviso?: string;
    };

    expect(result.puntos.map((p) => p.fecha)).toEqual([
      "2026-07-01",
      "2026-09-01",
    ]);
    expect(result.puntos[1].calorias).toBe(2000);
    expect(result.aviso).toContain("raciones");
  });

  it("no devuelve macronutrientes", async () => {
    const result = await run("estadisticas_paciente", { paciente_id: "p1" });

    expect(JSON.stringify(result).toLowerCase()).not.toContain("macro");
  });
});

describe("comparar_dietas", () => {
  function comparison(previousVersion: number, currentVersion: number) {
    return {
      ok: true,
      comparison: {
        previous: {
          consultationId: "c1",
          dietVersion: previousVersion,
          createdAt: "2026-07-01T10:00:00Z",
          calories: 2200,
          weight: 82,
        },
        current: {
          consultationId: "c2",
          dietVersion: currentVersion,
          createdAt: "2026-09-01T10:00:00Z",
          calories: 2000,
          weight: 80,
        },
        portions: [],
        added: ["avena"],
        removed: ["pan blanco"],
        summary: "Se baja el hidrato de la cena.",
      },
    };
  }

  it("compara el par consecutivo y explica qué cambió", async () => {
    loadComparison.mockResolvedValue(comparison(1, 2));

    const result = (await run("comparar_dietas", {
      paciente_id: "p1",
      version_a: 2,
      version_b: 1,
    })) as {
      aviso?: string;
      alimentos_que_entran: string[];
      resumen: string;
    };

    // Se compara desde la versión más reciente de las dos.
    expect(loadComparison).toHaveBeenCalledWith(expect.anything(), "c2");
    expect(result.aviso).toBeUndefined();
    expect(result.alimentos_que_entran).toEqual(["avena"]);
    expect(result.resumen).toContain("hidrato");
  });

  it("si las versiones no son consecutivas, lo dice", async () => {
    loadComparison.mockResolvedValue(comparison(1, 2));

    const result = (await run("comparar_dietas", {
      paciente_id: "p1",
      version_a: 2,
      version_b: 0,
    })) as { aviso?: string };

    expect(result.aviso).toContain("consecutivas");
    expect(result.aviso).toContain("v1");
  });

  it("la primera dieta no tiene anterior", async () => {
    loadComparison.mockResolvedValue({ ok: false, failure: "first_diet" });

    await expect(
      run("comparar_dietas", { paciente_id: "p1", version_a: 1, version_b: 2 }),
    ).rejects.toThrow(/primera dieta/);
  });

  it("una versión inexistente es un error explicativo, no una comparación vacía", async () => {
    await expect(
      run("comparar_dietas", { paciente_id: "p1", version_a: 7, version_b: 6 }),
    ).rejects.toThrow(/v7/);
    expect(loadComparison).not.toHaveBeenCalled();
  });

  it("dos veces la misma versión es un error de argumentos", async () => {
    await expect(
      run("comparar_dietas", { paciente_id: "p1", version_a: 2, version_b: 2 }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("pacientes_por_criterio", () => {
  const APPOINTMENTS = [
    {
      id: "a1",
      patient_id: "p1",
      start_time: "2026-09-29T08:00:00.000Z",
      end_time: "2026-09-29T08:30:00.000Z",
      type: "revision",
      status: "pending",
      notes: null,
      patients: { id: "p1", name_surnames: "Rubén Díaz" },
    },
    {
      id: "a2",
      patient_id: "p3",
      start_time: "2026-09-30T09:00:00.000Z",
      end_time: "2026-09-30T09:30:00.000Z",
      type: "seguimiento",
      status: "pending",
      notes: null,
      patients: { id: "p3", name_surnames: "Laura Martín" },
    },
  ];

  const withAppointments = () =>
    context({
      patients: PATIENTS,
      patient_consultations: CONSULTATIONS,
      appointments: APPOINTMENTS,
    });

  it("revisiones de un rango, con día y tipo", async () => {
    const result = (await run(
      "pacientes_por_criterio",
      {
        criterio: "citas_en_rango",
        desde: "2026-09-28",
        hasta: "2026-10-04",
        tipos: ["revision"],
      },
      withAppointments(),
    )) as { pacientes: Array<{ nombre: string; cita: string; tipo: string }> };

    expect(result.pacientes).toHaveLength(1);
    expect(result.pacientes[0].nombre).toBe("Rubén Díaz");
    expect(result.pacientes[0].tipo).toBe("revision");
    expect(result.pacientes[0].cita).toContain("2026-09-29");
  });

  it("un rango sin citas devuelve lista vacía", async () => {
    const result = (await run(
      "pacientes_por_criterio",
      { criterio: "citas_en_rango", desde: "2026-12-01", hasta: "2026-12-07" },
      withAppointments(),
    )) as { pacientes: unknown[] };

    expect(result.pacientes).toEqual([]);
  });

  it("pacientes sin consulta desde una fecha, incluidos los que nunca vinieron", async () => {
    const result = (await run("pacientes_por_criterio", {
      criterio: "sin_consulta_desde",
      desde: "2026-08-01",
    })) as {
      pacientes: Array<{ paciente_id: string; ultima_consulta: string | null }>;
    };

    // p1 vino en septiembre; p2 nunca; p3 vino el 10 de septiembre.
    expect(result.pacientes.map((p) => p.paciente_id)).toEqual(["p2"]);
    expect(result.pacientes[0].ultima_consulta).toBeNull();
  });

  it("pacientes sin ninguna dieta", async () => {
    const result = (await run("pacientes_por_criterio", {
      criterio: "sin_dieta",
    })) as { pacientes: Array<{ paciente_id: string }> };

    expect(result.pacientes.map((p) => p.paciente_id).sort()).toEqual([
      "p2",
      "p3",
    ]);
  });

  it("un criterio que no cubre se rechaza explicando cuáles sí", async () => {
    await expect(
      run("pacientes_por_criterio", { criterio: "los_que_engordaron" }),
    ).rejects.toThrow(/citas_en_rango/);
  });

  it("citas_en_rango sin fechas es un error de argumentos", async () => {
    await expect(
      run("pacientes_por_criterio", { criterio: "citas_en_rango" }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});
