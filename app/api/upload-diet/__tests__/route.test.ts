import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { createClient, supabase, storageBucket, updateChain, revalidatePath } =
  vi.hoisted(() => {
    const storageBucket = {
      upload: vi.fn(),
      createSignedUrl: vi.fn(),
    };
    // Cadena de patient_consultations: select().eq().eq().maybeSingle() para
    // comprobar la consulta, update().eq() para enlazar el fichero.
    const updateChain = {
      select: vi.fn(),
      update: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    const supabase = {
      auth: { getUser: vi.fn() },
      storage: { from: vi.fn(() => storageBucket) },
      from: vi.fn(() => updateChain),
    };
    return {
      createClient: vi.fn(async () => supabase),
      supabase,
      storageBucket,
      updateChain,
      revalidatePath: vi.fn(),
    };
  });

vi.mock("../../../../lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { POST } from "../route";

function requestWith(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const validBody = {
  consultationId: "consultation-1",
  patientId: "patient-1",
  dietMd: "# Plan nutricional",
};

describe("POST /api/upload-diet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    storageBucket.upload.mockResolvedValue({ error: null });
    storageBucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage/signed/consultation-1.md?token=t" },
      error: null,
    });
    updateChain.select.mockReturnValue(updateChain);
    updateChain.update.mockReturnValue(updateChain);
    // eq() encadena en la comprobación y resuelve en el update.
    updateChain.eq.mockImplementation(() =>
      Object.assign(Promise.resolve({ error: null }), updateChain),
    );
    updateChain.maybeSingle.mockResolvedValue({
      data: { id: "consultation-1" },
      error: null,
    });
  });

  it("sube el markdown bajo la carpeta del usuario, guarda la ruta y devuelve una URL firmada", async () => {
    const response = await POST(requestWith(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      url: "https://storage/signed/consultation-1.md?token=t",
    });
    expect(supabase.storage.from).toHaveBeenCalledWith("diets");
    expect(storageBucket.upload).toHaveBeenCalledWith(
      "u1/patient-1/consultation-1.md",
      expect.anything(),
      { contentType: "text/markdown", upsert: true },
    );
    const uploaded = storageBucket.upload.mock.calls[0][1];
    expect(new TextDecoder().decode(uploaded)).toBe("# Plan nutricional");
    expect(supabase.from).toHaveBeenCalledWith("patient_consultations");
    // Bucket privado: se guarda la ruta, no una URL. La URL se firma al abrirla.
    expect(updateChain.update).toHaveBeenCalledWith({
      documento_url: "u1/patient-1/consultation-1.md",
      diet_md: "# Plan nutricional",
    });
    expect(storageBucket.createSignedUrl).toHaveBeenCalledWith(
      "u1/patient-1/consultation-1.md",
      expect.any(Number),
    );
    expect(updateChain.eq).toHaveBeenCalledWith("id", "consultation-1");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/patient/patient-1");
  });

  it("responde 400 si falta algún campo", async () => {
    const response = await POST(
      requestWith({ consultationId: "consultation-1", patientId: "patient-1" }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
    expect(storageBucket.upload).not.toHaveBeenCalled();
  });

  it("responde 401 sin usuario autenticado", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestWith(validBody));

    expect(response.status).toBe(401);
    expect((await response.json()).success).toBe(false);
    expect(storageBucket.upload).not.toHaveBeenCalled();
  });

  it("responde 404 sin subir nada si la consulta no existe o no es del usuario", async () => {
    updateChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(requestWith(validBody));

    expect(response.status).toBe(404);
    expect((await response.json()).success).toBe(false);
    expect(storageBucket.upload).not.toHaveBeenCalled();
  });

  it("responde 500 con el error en el cuerpo si falla la subida, sin tocar la consulta", async () => {
    storageBucket.upload.mockResolvedValue({
      error: { message: "bucket down" },
    });

    const response = await POST(requestWith(validBody));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: "Error al subir el fichero: bucket down",
    });
    expect(updateChain.update).not.toHaveBeenCalled();
  });

  it("responde 500 con el error en el cuerpo si falla la actualización de la consulta", async () => {
    updateChain.update.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: "row locked" } }),
    });

    const response = await POST(requestWith(validBody));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Error al guardar la URL en base de datos: row locked",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
