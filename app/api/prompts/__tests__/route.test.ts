import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import {
  createFakeSupabase,
  type FakeSupabase,
} from "@/services/__tests__/helpers/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("../../../../lib/supabase/server", () => ({ createClient }));

import { GET as listPrompts } from "../route";
import {
  GET as listVersions,
  POST as createVersion,
} from "../[id]/versiones/route";
import { POST as activate } from "../[id]/activar/route";

const OWNER = "u1";

function seeded(): FakeSupabase {
  return createFakeSupabase({
    userId: OWNER,
    tables: {
      prompts: [
        {
          id: "p1",
          slug: "generacion-dieta",
          nombre: "Generación de dieta",
          tipo: "generacion_dieta",
          version_activa_id: "pv1",
          version_activada_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "p-ajeno",
          slug: "generacion-dieta",
          nombre: "El prompt de otra",
          tipo: "generacion_dieta",
          version_activa_id: "pv-ajena",
          version_activada_at: null,
          created_by: "u2",
        },
        {
          id: "p-sin-version",
          slug: "validacion-alergias",
          nombre: "Validación de alergias",
          tipo: "validacion_alergias",
          version_activa_id: null,
          version_activada_at: null,
          created_by: OWNER,
        },
      ],
      prompt_versiones: [
        {
          id: "pv1",
          prompt_id: "p1",
          version: 1,
          contenido: "Prompt original",
          nota_cambio: null,
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "pv-ajena",
          prompt_id: "p-ajeno",
          version: 1,
          contenido: "SECRETO DE OTRA USUARIA",
          nota_cambio: null,
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: "u2",
        },
      ],
    },
  });
}

function body(payload: unknown): NextRequest {
  return { json: async () => payload } as unknown as NextRequest;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let supabase: FakeSupabase;

beforeEach(() => {
  vi.clearAllMocks();
  supabase = seeded();
  createClient.mockImplementation(async () => supabase);
});

describe("GET /api/prompts", () => {
  it("lista los prompts del usuario con su versión activa marcada", async () => {
    const response = await listPrompts();
    const { prompts } = await response.json();

    expect(response.status).toBe(200);
    const mine = prompts.find((prompt: { id: string }) => prompt.id === "p1");
    expect(mine.versionActiva).toEqual({
      id: "pv1",
      version: 1,
      activadaEn: "2026-10-01T09:00:00.000Z",
    });
  });

  it("no incluye el prompt de otro usuario", async () => {
    const { prompts } = await (await listPrompts()).json();

    expect(prompts.map((prompt: { id: string }) => prompt.id)).not.toContain(
      "p-ajeno",
    );
  });

  it("señala el prompt sin versión activa en lugar de ocultarlo", async () => {
    const { prompts } = await (await listPrompts()).json();
    const withoutVersion = prompts.find(
      (prompt: { id: string }) => prompt.id === "p-sin-version",
    );

    expect(withoutVersion).toBeDefined();
    expect(withoutVersion.versionActiva).toBeNull();
  });

  it("sin sesión responde 401", async () => {
    supabase.auth.getUser = async () => ({ data: { user: null } });

    expect((await listPrompts()).status).toBe(401);
  });
});

describe("GET /api/prompts/[id]/versiones", () => {
  it("devuelve el histórico con número, fecha y nota", async () => {
    const response = await listVersions(body(null), params("p1"));
    const { versiones } = await response.json();

    expect(response.status).toBe(200);
    expect(versiones).toHaveLength(1);
    expect(versiones[0]).toMatchObject({ version: 1, activa: true });
  });

  it("un prompt ajeno responde 404 y no filtra su contenido", async () => {
    const response = await listVersions(body(null), params("p-ajeno"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(JSON.stringify(payload)).not.toContain("SECRETO DE OTRA USUARIA");
  });
});

describe("POST /api/prompts/[id]/versiones", () => {
  it("crea una versión nueva sin tocar la activa", async () => {
    const response = await createVersion(
      body({ contenido: "Prompt retocado", notaCambio: "Subo la proteína" }),
      params("p1"),
    );
    const { version } = await response.json();

    expect(response.status).toBe(200);
    expect(version.version).toBe(2);
    expect(version.activa).toBe(false);
    expect(
      supabase.tables.prompts.find((prompt) => prompt.id === "p1")!
        .version_activa_id,
    ).toBe("pv1");
  });

  it("rechaza el contenido vacío con 400 y mensaje", async () => {
    const response = await createVersion(
      body({ contenido: "   " }),
      params("p1"),
    );
    const { error } = await response.json();

    expect(response.status).toBe(400);
    expect(error).toContain("vacío");
    expect(supabase.tables.prompt_versiones).toHaveLength(2);
  });

  it("rechaza el contenido idéntico al de la versión activa", async () => {
    const response = await createVersion(
      body({ contenido: "Prompt original" }),
      params("p1"),
    );
    const { error } = await response.json();

    expect(response.status).toBe(400);
    expect(error).toContain("No hay cambios");
    expect(supabase.tables.prompt_versiones).toHaveLength(2);
  });

  it("un prompt ajeno responde 404 sin escribir nada", async () => {
    const response = await createVersion(
      body({ contenido: "Intento colarme" }),
      params("p-ajeno"),
    );

    expect(response.status).toBe(404);
    expect(supabase.tables.prompt_versiones).toHaveLength(2);
  });
});

describe("POST /api/prompts/[id]/activar", () => {
  it("mueve el puntero y registra la fecha de activación", async () => {
    await createVersion(body({ contenido: "Prompt v2" }), params("p1"));
    const created = supabase.tables.prompt_versiones.at(-1)!;

    const response = await activate(
      body({ versionId: created.id }),
      params("p1"),
    );
    const { activada } = await response.json();

    expect(response.status).toBe(200);
    expect(activada.version).toBe(2);
    const prompt = supabase.tables.prompts.find(
      (candidate) => candidate.id === "p1",
    )!;
    expect(prompt.version_activa_id).toBe(created.id);
    expect(prompt.version_activada_at).toBe(activada.activadaEn);
  });

  it("rechaza una versión que pertenece a otro prompt", async () => {
    const response = await activate(
      body({ versionId: "pv1" }),
      params("p-sin-version"),
    );

    expect(response.status).toBe(404);
    expect(
      supabase.tables.prompts.find((prompt) => prompt.id === "p-sin-version")!
        .version_activa_id,
    ).toBeNull();
  });

  it("rechaza una versión de otro usuario", async () => {
    const response = await activate(
      body({ versionId: "pv-ajena" }),
      params("p1"),
    );

    expect(response.status).toBe(404);
    expect(
      supabase.tables.prompts.find((prompt) => prompt.id === "p1")!
        .version_activa_id,
    ).toBe("pv1");
  });

  it("sin versión indicada responde 400", async () => {
    expect((await activate(body({}), params("p1"))).status).toBe(400);
  });
});

describe("crear, activar y restaurar", () => {
  it("restaurar crea una versión nueva y deja el histórico intacto", async () => {
    // v2: un cambio que luego se quiere deshacer.
    await createVersion(body({ contenido: "Prompt v2" }), params("p1"));
    const v2 = supabase.tables.prompt_versiones.at(-1)!;
    await activate(body({ versionId: v2.id }), params("p1"));

    // Restaurar v1 = crear v3 con el contenido de v1.
    const restored = await createVersion(
      body({ contenido: "Prompt original", notaCambio: "Restaura v1" }),
      params("p1"),
    );
    const { version } = await restored.json();

    expect(version.version).toBe(3);
    expect(version.activa).toBe(false);

    const versions = supabase.tables.prompt_versiones.filter(
      (row) => row.prompt_id === "p1",
    );
    expect(versions.map((row) => row.version)).toEqual([1, 2, 3]);
    // El historial no se reescribe: v1 y v2 siguen con su contenido.
    expect(versions[0].contenido).toBe("Prompt original");
    expect(versions[1].contenido).toBe("Prompt v2");

    // Y sigue activa la v2 hasta que se active la restaurada.
    expect(
      supabase.tables.prompts.find((prompt) => prompt.id === "p1")!
        .version_activa_id,
    ).toBe(v2.id);

    await activate(body({ versionId: version.id }), params("p1"));
    expect(
      supabase.tables.prompts.find((prompt) => prompt.id === "p1")!
        .version_activa_id,
    ).toBe(version.id);
  });
});
