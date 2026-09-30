import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  createClient,
  supabase,
  chain,
  storageBucket,
  revalidatePath,
  renderDietPdf,
} = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const storageBucket = { upload: vi.fn(), createSignedUrl: vi.fn() };
  const supabase = {
    auth: { getUser: vi.fn() },
    storage: { from: vi.fn(() => storageBucket) },
    from: vi.fn(() => chain),
  };
  return {
    createClient: vi.fn(async () => supabase),
    supabase,
    chain,
    storageBucket,
    revalidatePath: vi.fn(),
    renderDietPdf: vi.fn(),
  };
});

vi.mock("../../../../lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/services/diet-pdf-service", async () => {
  class UnstructuredDietError extends Error {
    constructor() {
      super(
        "Esta dieta es anterior al formato con plantilla y solo puede consultarse como markdown.",
      );
      this.name = "UnstructuredDietError";
    }
  }
  return { renderDietPdf, UnstructuredDietError };
});

import { POST, maxDuration } from "../route";
import { DIET_TEMPLATE_VERSION } from "@/constants/diet-pdf/diet-contract";
import { UnstructuredDietError } from "@/services/diet-pdf-service";

function requestWith(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const DIET_MD = "---\npaciente: Sandra\n---\n\n## Objetivos\n\n- Algo.\n";
const HASH = createHash("sha256")
  .update(`v${DIET_TEMPLATE_VERSION}\n${DIET_MD}`, "utf8")
  .digest("hex");

function consultationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    patient_id: "p1",
    diet_md: DIET_MD,
    pdf_path: null,
    pdf_source_hash: null,
    created_at: "2025-12-09T18:16:14.000Z",
    ...overrides,
  };
}

describe("POST /api/diet-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    chain.select.mockReturnValue(chain);
    chain.update.mockReturnValue(chain);
    chain.eq.mockImplementation(() =>
      Object.assign(Promise.resolve({ error: null }), chain),
    );
    chain.maybeSingle.mockResolvedValue({ data: consultationRow() });
    storageBucket.upload.mockResolvedValue({ error: null });
    storageBucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage/signed/c1.pdf?token=t" },
      error: null,
    });
    renderDietPdf.mockResolvedValue(Buffer.from("%PDF-1.4"));
  });

  it("declara su propio maxDuration: es la única ruta que carga Chromium", () => {
    expect(maxDuration).toBe(60);
  });

  it("renderiza y guarda cuando la consulta no tiene PDF", async () => {
    const response = await POST(requestWith({ consultationId: "c1" }));

    expect(renderDietPdf).toHaveBeenCalledOnce();
    expect(storageBucket.upload).toHaveBeenCalledWith(
      "u1/p1/c1.pdf",
      expect.any(Buffer),
      { contentType: "application/pdf", upsert: true },
    );
    expect(chain.update).toHaveBeenCalledWith({
      pdf_path: "u1/p1/c1.pdf",
      pdf_source_hash: HASH,
    });
    expect((await response.json()).url).toContain("token=t");
  });

  it("reutiliza el guardado cuando la huella coincide", async () => {
    chain.maybeSingle.mockResolvedValue({
      data: consultationRow({
        pdf_path: "u1/p1/c1.pdf",
        pdf_source_hash: HASH,
      }),
    });

    const response = await POST(requestWith({ consultationId: "c1" }));

    expect(renderDietPdf).not.toHaveBeenCalled();
    expect(storageBucket.upload).not.toHaveBeenCalled();
    expect(chain.update).not.toHaveBeenCalled();
    expect(storageBucket.createSignedUrl).toHaveBeenCalledWith(
      "u1/p1/c1.pdf",
      3600,
    );
    expect(response.status).toBe(200);
  });

  it("regenera cuando cambia la plantilla, aunque el documento sea el mismo", async () => {
    // El fallo real: se arregló el parser, los PDF guardados seguían sirviendo
    // los días sin comidas porque el markdown no había cambiado.
    const huellaDeOtraPlantilla = createHash("sha256")
      .update(`v${DIET_TEMPLATE_VERSION - 1}\n${DIET_MD}`, "utf8")
      .digest("hex");

    chain.maybeSingle.mockResolvedValue({
      data: consultationRow({
        pdf_path: "u1/p1/c1.pdf",
        pdf_source_hash: huellaDeOtraPlantilla,
      }),
    });

    await POST(requestWith({ consultationId: "c1" }));

    expect(renderDietPdf).toHaveBeenCalledOnce();
    expect(chain.update).toHaveBeenCalledWith({
      pdf_path: "u1/p1/c1.pdf",
      pdf_source_hash: HASH,
    });
  });

  it("regenera cuando el documento ha cambiado desde el último PDF", async () => {
    chain.maybeSingle.mockResolvedValue({
      data: consultationRow({
        pdf_path: "u1/p1/c1.pdf",
        pdf_source_hash: "huella-de-otro-texto",
      }),
    });

    await POST(requestWith({ consultationId: "c1" }));

    expect(renderDietPdf).toHaveBeenCalledOnce();
    expect(storageBucket.upload).toHaveBeenCalled();
    expect(chain.update).toHaveBeenCalledWith({
      pdf_path: "u1/p1/c1.pdf",
      pdf_source_hash: HASH,
    });
  });

  it("guarda bajo la carpeta del usuario, en el bucket privado de dietas", async () => {
    await POST(requestWith({ consultationId: "c1" }));

    expect(supabase.storage.from).toHaveBeenCalledWith("diets");
    expect(storageBucket.upload.mock.calls[0][0]).toBe("u1/p1/c1.pdf");
  });

  it("rechaza en español una dieta anterior al contrato", async () => {
    renderDietPdf.mockRejectedValue(new UnstructuredDietError());

    const response = await POST(requestWith({ consultationId: "c1" }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain(
      "anterior al formato con plantilla",
    );
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("no deja apuntada una ruta si la subida falla", async () => {
    storageBucket.upload.mockResolvedValue({ error: { message: "boom" } });

    const response = await POST(requestWith({ consultationId: "c1" }));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe(
      "No se pudo guardar el PDF. Inténtalo de nuevo.",
    );
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("explica en español un fallo de render sin tocar la fila", async () => {
    renderDietPdf.mockRejectedValue(new Error("chromium se cayó"));

    const response = await POST(requestWith({ consultationId: "c1" }));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe(
      "No se pudo generar el PDF. Inténtalo de nuevo.",
    );
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("responde 400 en español si falta el identificador", async () => {
    const response = await POST(requestWith({}));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Falta el identificador de la consulta.",
    );
  });

  it("responde 404 en español ante una consulta ajena o sin dieta", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null });

    const response = await POST(requestWith({ consultationId: "ajena" }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("No se encuentra la consulta.");
    expect(renderDietPdf).not.toHaveBeenCalled();
  });
});
