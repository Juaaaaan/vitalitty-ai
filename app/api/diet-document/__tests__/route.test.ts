import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { createClient, supabase, chain, revalidatePath } = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const supabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => chain),
  };
  return {
    createClient: vi.fn(async () => supabase),
    supabase,
    chain,
    revalidatePath: vi.fn(),
  };
});

vi.mock("../../../../lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { PUT } from "../route";

function requestWith(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("PUT /api/diet-document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    chain.select.mockReturnValue(chain);
    chain.update.mockReturnValue(chain);
    // eq() encadena en la comprobación y resuelve en el update.
    chain.eq.mockImplementation(() =>
      Object.assign(Promise.resolve({ error: null }), chain),
    );
    chain.maybeSingle.mockResolvedValue({
      data: { id: "c1", patient_id: "p1" },
      error: null,
    });
  });

  it("reescribe el documento de la consulta", async () => {
    const response = await PUT(
      requestWith({ consultationId: "c1", dietMd: "# Dieta corregida" }),
    );

    expect(response.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ diet_md: "# Dieta corregida" });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/patient/p1");
  });

  it("no toca la versión ni el PDF guardado", async () => {
    await PUT(requestWith({ consultationId: "c1", dietMd: "# Otra cosa" }));

    const [payload] = chain.update.mock.calls[0];

    // Una corrección es la misma dieta: ni consume versión ni crea consulta.
    expect(payload).not.toHaveProperty("diet_version");
    // El PDF se invalida solo, porque su huella deja de coincidir.
    expect(payload).not.toHaveProperty("pdf_path");
    expect(payload).not.toHaveProperty("pdf_source_hash");
    expect(Object.keys(payload)).toEqual(["diet_md"]);
  });

  it("rechaza un documento vacío y conserva el anterior", async () => {
    const response = await PUT(
      requestWith({ consultationId: "c1", dietMd: "   " }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Escribe el contenido de la dieta antes de guardar.",
    );
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("responde 400 en español si falta el identificador", async () => {
    const response = await PUT(requestWith({ dietMd: "# Dieta" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Falta el identificador de la consulta.",
    );
  });

  it("responde 404 en español ante una consulta ajena y no escribe", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await PUT(
      requestWith({ consultationId: "ajena", dietMd: "# Dieta" }),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("No se encuentra la consulta.");
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("responde 401 en español si no hay sesión", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await PUT(
      requestWith({ consultationId: "c1", dietMd: "# Dieta" }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe(
      "Inicia sesión para editar la dieta.",
    );
  });
});
