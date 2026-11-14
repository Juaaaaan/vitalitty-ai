import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("../../../lib/ai/anthropic", () => ({
  default: { messages: { stream: vi.fn() } },
}));

import {
  loadBrainContext,
  profileTextFromMemory,
} from "@/services/brain-retrieval-service";
import {
  createFakeSupabase,
  type FakeSupabase,
} from "@/services/__tests__/helpers/fake-supabase";
import {
  findDefaultPrompt,
  PROMPT_TYPE_DIET_GENERATION,
} from "@/constants/brain-prompts";
import { tagMatchesProfile } from "@/constants/brain-tag-vocabulary";
import type { PatientMemory } from "@/models/patient-context/patient-memory.models";

const OWNER = "u1";

function memoryWith(clinical: PatientMemory["clinical"] = {}): PatientMemory {
  return {
    personal: {
      name_surnames: "Laura Martín",
      age: 34,
      gender: "F",
      height: 165,
      weight: 62,
    },
    clinical,
    summaries: [],
    lastDietMd: null,
  };
}

function seeded(
  overrides: Parameters<typeof createFakeSupabase>[0]["tables"] = {},
) {
  return createFakeSupabase({
    userId: OWNER,
    tables: {
      prompts: [
        {
          id: "p1",
          slug: "generacion-dieta",
          nombre: "Generación de dieta",
          tipo: "generacion_dieta",
          version_activa_id: "pv2",
          version_activada_at: "2026-10-02T09:00:00.000Z",
          created_by: OWNER,
        },
      ],
      prompt_versiones: [
        {
          id: "pv1",
          prompt_id: "p1",
          version: 1,
          contenido: "Prompt viejo",
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "pv2",
          prompt_id: "p1",
          version: 2,
          contenido: "Prompt activo del Cerebro",
          created_at: "2026-10-02T09:00:00.000Z",
          created_by: OWNER,
        },
      ],
      documentos_conocimiento: [
        {
          id: "d-protocolo",
          slug: "a-protocolo",
          titulo: "Protocolo del editor",
          tipo: "protocolo",
          tags: ["estilo"],
          siempre_incluir: true,
          version_activa_id: "dv-protocolo",
          created_by: OWNER,
        },
        {
          id: "d-gluten",
          slug: "b-gluten",
          titulo: "Sin gluten",
          tipo: "protocolo",
          tags: ["celiaquia", "gluten"],
          siempre_incluir: false,
          version_activa_id: "dv-gluten",
          created_by: OWNER,
        },
        {
          id: "d-sin-activa",
          slug: "c-sin-version-activa",
          titulo: "Borrador sin activar",
          tipo: "paper",
          tags: ["celiaquia"],
          siempre_incluir: false,
          version_activa_id: null,
          created_by: OWNER,
        },
        {
          id: "d-no-aplica",
          slug: "d-no-aplica",
          titulo: "Protocolo de embarazo",
          tipo: "protocolo",
          tags: ["embarazo"],
          siempre_incluir: false,
          version_activa_id: "dv-no-aplica",
          created_by: OWNER,
        },
      ],
      documento_versiones: [
        {
          id: "dv-protocolo",
          documento_id: "d-protocolo",
          version: 1,
          contenido_md: "# Protocolo\n\nTono",
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "dv-gluten",
          documento_id: "d-gluten",
          version: 1,
          contenido_md: "# Sin gluten\n\nEvitar trigo",
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "dv-borrador",
          documento_id: "d-sin-activa",
          version: 1,
          contenido_md: "# Borrador",
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "dv-no-aplica",
          documento_id: "d-no-aplica",
          version: 1,
          contenido_md: "# Embarazo",
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
      ],
      ...overrides,
    },
  });
}

function asClient(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("profileTextFromMemory", () => {
  it("un paciente nuevo no aporta texto", () => {
    expect(profileTextFromMemory(null)).toBe("");
  });

  it("normaliza acentos y mayúsculas, y junta todos los campos", () => {
    const text = profileTextFromMemory(
      memoryWith({
        patologias: "Celiaquía, SOP / Hipotiroidismo",
        suplementos: "Creatina 8g/día",
      }),
    );

    expect(text).toContain("celiaquia");
    expect(text).toContain("hipotiroidismo");
    expect(text).toContain("creatina");
  });

  it("devuelve siempre el mismo texto para el mismo paciente", () => {
    const memory = memoryWith({
      patologias: ["Celiaquía"],
      objetivo_tipo: "Recomposición",
    });

    expect(profileTextFromMemory(memory)).toBe(profileTextFromMemory(memory));
  });

  /**
   * El fallo que dejó el vault fuera de todas las generaciones: la ficha habla
   * en prosa dictada y el documento en vocabulario de archivo, así que cruzarlos
   * por igualdad de elementos no casa nunca. Estos casos son la alarma.
   */
  describe("tagMatchesProfile", () => {
    it("casa la etiqueta con el sinónimo que de verdad dice la ficha", () => {
      const text = profileTextFromMemory(
        memoryWith({ objetivo_tipo: ["Aumentar masa muscular"] }),
      );

      expect(tagMatchesProfile("hipertrofia", text)).toBe(true);
    });

    it("casa celiaquía con la etiqueta del gluten", () => {
      const text = profileTextFromMemory(
        memoryWith({ patologias: ["Celiaquía"] }),
      );

      expect(tagMatchesProfile("gluten", text)).toBe(true);
    });

    it("no casa una etiqueta que la ficha no menciona", () => {
      const text = profileTextFromMemory(
        memoryWith({ objetivo_tipo: ["Bajar grasa"] }),
      );

      expect(tagMatchesProfile("microbiota", text)).toBe(false);
    });

    it("exige palabra completa, no subcadena", () => {
      expect(tagMatchesProfile("pms", "toma pmsx a diario")).toBe(false);
      expect(tagMatchesProfile("pms", "molestias de pms")).toBe(true);
    });
  });
});

describe("loadBrainContext", () => {
  it("usa la versión activa del prompt, no la vieja", async () => {
    const result = await loadBrainContext(asClient(seeded()), {});

    expect(result.degraded).toBe(false);
    expect(result.brain.promptContent).toBe("Prompt activo del Cerebro");
  });

  it("selecciona el documento cuya etiqueta cruza con el paciente", async () => {
    const result = await loadBrainContext(asClient(seeded()), {
      memory: memoryWith({ patologias: "Celiaquía" }),
    });

    expect(result.brain.documents.map((document) => document.titulo)).toEqual([
      "Protocolo del editor",
      "Sin gluten",
    ]);
  });

  it("no mete un documento que no aplica a este paciente", async () => {
    const result = await loadBrainContext(asClient(seeded()), {
      memory: memoryWith({ patologias: "Celiaquía" }),
    });

    expect(
      result.brain.documents.map((document) => document.titulo),
    ).not.toContain("Protocolo de embarazo");
  });

  it("un paciente nuevo solo recibe los de inclusión incondicional", async () => {
    const result = await loadBrainContext(asClient(seeded()), { memory: null });

    expect(result.brain.documents.map((document) => document.titulo)).toEqual([
      "Protocolo del editor",
    ]);
  });

  it("un documento sin versión activa no entra aunque su metadata encaje", async () => {
    const result = await loadBrainContext(asClient(seeded()), {
      memory: memoryWith({ patologias: "Celiaquía" }),
    });

    expect(
      result.brain.documents.map((document) => document.titulo),
    ).not.toContain("Borrador sin activar");
  });

  it("un documento que encaja por dos criterios aparece una sola vez", async () => {
    const result = await loadBrainContext(asClient(seeded()), {
      // Cruza con "celiaquia" y con "gluten": las dos etiquetas del documento.
      memory: memoryWith({
        patologias: "Celiaquía",
        alimentos_evitar: ["gluten"],
      }),
    });

    const titles = result.brain.documents.map((document) => document.titulo);
    expect(titles.filter((title) => title === "Sin gluten")).toHaveLength(1);
  });

  it("devuelve los documentos en el mismo orden entre llamadas", async () => {
    const memory = memoryWith({ patologias: "Celiaquía" });

    const first = await loadBrainContext(asClient(seeded()), { memory });
    const second = await loadBrainContext(asClient(seeded()), { memory });

    expect(first.brain.documents).toEqual(second.brain.documents);
  });

  it("solo devuelve contenido: ni ids, ni fechas, ni números de versión", async () => {
    const result = await loadBrainContext(asClient(seeded()), {
      memory: memoryWith({ patologias: "Celiaquía" }),
    });

    for (const document of result.brain.documents) {
      expect(Object.keys(document).sort()).toEqual(["contenidoMd", "titulo"]);
    }

    const serialized = JSON.stringify(result.brain);
    expect(serialized).not.toContain("dv-gluten");
    expect(serialized).not.toContain("2026-10-01T09:00:00.000Z");
    expect(serialized).not.toMatch(/"version"/);
  });
});

describe("loadBrainContext — camino degradado", () => {
  it("sin versión activa del prompt cae al prompt por defecto del código", async () => {
    const fake = seeded();
    fake.tables.prompts[0].version_activa_id = null;

    const result = await loadBrainContext(asClient(fake), {});

    expect(result.degraded).toBe(true);
    expect(result.reason).toBe("no_active_prompt");
    expect(result.brain.promptContent).toBe(
      findDefaultPrompt(PROMPT_TYPE_DIET_GENERATION)!.contenido,
    );
    expect(warn).toHaveBeenCalled();
  });

  it("con las tablas vacías resuelve con los valores por defecto", async () => {
    const empty = createFakeSupabase({ userId: OWNER });

    const result = await loadBrainContext(asClient(empty), {});

    expect(result.degraded).toBe(true);
    expect(result.brain.documents).toEqual([]);
    expect(result.brain.promptContent.length).toBeGreaterThan(0);
  });

  it("un fallo de la query resuelve en lugar de lanzar", async () => {
    const failing = createFakeSupabase({
      userId: OWNER,
      failSelectOn: ["documentos_conocimiento"],
    });

    const result = await loadBrainContext(asClient(failing), {});

    expect(result.degraded).toBe(true);
    expect(result.reason).toBe("query_failed");
    expect(result.brain.documents).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it("al agotar el presupuesto de tiempo resuelve con los valores por defecto", async () => {
    const slow = {
      from: () => ({
        select: () => ({
          eq: () => new Promise(() => {}),
          or: () => new Promise(() => {}),
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await loadBrainContext(slow, { timeoutMs: 10 });

    expect(result.degraded).toBe(true);
    expect(result.reason).toBe("timeout");
    expect(result.brain.documents).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

describe("loadBrainContext — aislamiento por usuario", () => {
  it("no devuelve el prompt ni los documentos de otro usuario", async () => {
    const fake = createFakeSupabase({
      userId: "u1",
      tables: {
        prompts: [
          {
            id: "p-otro",
            slug: "generacion-dieta",
            nombre: "El de otra",
            tipo: "generacion_dieta",
            version_activa_id: "pv-otro",
            created_by: "u2",
          },
        ],
        prompt_versiones: [
          {
            id: "pv-otro",
            prompt_id: "p-otro",
            version: 1,
            contenido: "PROMPT DE OTRA USUARIA",
            created_at: "2026-10-01T09:00:00.000Z",
            created_by: "u2",
          },
        ],
        documentos_conocimiento: [
          {
            id: "d-otro",
            slug: "doc-otro",
            titulo: "Documento de otra",
            tipo: "protocolo",
            tags: [],
            // Marcado "siempre incluir", y aun así no debe cruzar de usuario.
            siempre_incluir: true,
            version_activa_id: "dv-otro",
            created_by: "u2",
          },
        ],
        documento_versiones: [
          {
            id: "dv-otro",
            documento_id: "d-otro",
            version: 1,
            contenido_md: "CONOCIMIENTO DE OTRA USUARIA",
            created_at: "2026-10-01T09:00:00.000Z",
            created_by: "u2",
          },
        ],
      },
    });

    const result = await loadBrainContext(asClient(fake), {});

    expect(result.brain.promptContent).not.toContain("OTRA USUARIA");
    expect(result.brain.documents).toEqual([]);
    expect(result.degraded).toBe(true);
  });

  /**
   * El fallo que se escapó a producción: entre cada cabecera y su tabla de
   * versiones hay dos FK, así que un embed que no nombra por cuál unir lo
   * rechaza PostgREST con `PGRST201`. Como el retrieval no lanza nunca, la
   * generación se iba al camino degradado y la dieta salía sin Cerebro, sin que
   * nada fallara a la vista.
   *
   * Los tests no lo vieron porque el doble embebía siempre por la FK del padre
   * e ignoraba el hint. Ahora lo exige, y estos dos casos son la alarma: el
   * primero prueba que el doble rechaza la forma ambigua, el segundo que la
   * forma que usa el servicio sí resuelve.
   */
  describe("embeds that name their foreign key", () => {
    it("rejects an embed that does not say which relationship to use", async () => {
      const fake = seeded();

      const { data, error } = await asClient(fake)
        .from("documentos_conocimiento")
        .select("slug, documento_versiones(id, contenido_md)");

      expect(data).toBeNull();
      expect((error as { code?: string } | null)?.code).toBe("PGRST201");
    });

    it("resolves the active version when the foreign key is named", async () => {
      const fake = seeded();

      const { data, error } = await asClient(fake)
        .from("documentos_conocimiento")
        .select(
          "slug, documento_versiones!documentos_conocimiento_version_activa_id_fkey(id, contenido_md)",
        );

      expect(error).toBeNull();
      // Uno a uno: llega la versión activa y solo ella, no un array de versiones.
      const rows = data as { documento_versiones: unknown }[];
      expect(rows.length).toBeGreaterThan(0);
      expect(Array.isArray(rows[0].documento_versiones)).toBe(false);
    });
  });
});
