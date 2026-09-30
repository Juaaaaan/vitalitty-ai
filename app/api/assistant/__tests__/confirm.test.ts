import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const generarDieta = vi.hoisted(() => vi.fn());
const renderPdf = vi.hoisted(() => vi.fn());
vi.mock("@/services/assistant/write-tools", () => ({
  WRITE_TOOLS: { generar_dieta: generarDieta, render_pdf: renderPdf },
}));

import { POST } from "../confirm/route";
import { ToolNotFoundError } from "@/models/assistant/assistant.models";

const post = (body: unknown) => POST({ json: async () => body } as never);

beforeEach(() => {
  generarDieta.mockReset();
  renderPdf.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("POST /api/assistant/confirm", () => {
  it("ejecuta la acción confirmada y devuelve su resultado", async () => {
    generarDieta.mockResolvedValue({ consulta_id: "c9", version: 3 });

    const response = await post({
      tool: "generar_dieta",
      input: { paciente_id: "p1", instrucciones: "sube el hidrato" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { consulta_id: "c9", version: 3 },
    });
    expect(generarDieta).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
      { paciente_id: "p1", instrucciones: "sube el hidrato" },
    );
  });

  it("una herramienta de lectura no es confirmable", async () => {
    const response = await post({
      tool: "get_paciente",
      input: { paciente_id: "p1" },
    });

    expect(response.status).toBe(400);
    expect(generarDieta).not.toHaveBeenCalled();
  });

  it("una herramienta que no existe se rechaza", async () => {
    const response = await post({ tool: "borrar_paciente", input: {} });

    expect(response.status).toBe(400);
  });

  it("un paciente ajeno responde como no encontrado", async () => {
    generarDieta.mockRejectedValue(new ToolNotFoundError());

    const response = await post({
      tool: "generar_dieta",
      input: { paciente_id: "de-otro", instrucciones: "lo que sea" },
    });

    expect(response.status).toBe(404);
  });

  it("sin sesión no se ejecuta nada", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await post({
      tool: "generar_dieta",
      input: { paciente_id: "p1", instrucciones: "sube el hidrato" },
    });

    expect(response.status).toBe(401);
    expect(generarDieta).not.toHaveBeenCalled();
  });

  it("si la ejecución falla, dice que no se ha guardado nada", async () => {
    generarDieta.mockRejectedValue(new Error("boom"));

    const response = await post({
      tool: "generar_dieta",
      input: { paciente_id: "p1", instrucciones: "sube el hidrato" },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining("No se ha guardado nada"),
    });
  });
});
