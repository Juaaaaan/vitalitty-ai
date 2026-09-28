import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../../../lib/ai/anthropic", () => ({
  default: { messages: { create: createMock } },
}));

import { extractConsultationData } from "@/services/consultation-extraction-service";

function respondWith(payload: unknown) {
  createMock.mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });
}

describe("extractConsultationData", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("usa claude-haiku-4-5 con salida estructurada", async () => {
    respondWith({ patient: { name_surnames: "Laura" }, consultation: {} });

    await extractConsultationData("consulta");

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5",
        output_config: expect.objectContaining({
          format: expect.objectContaining({ type: "json_schema" }),
        }),
      }),
    );
  });

  it("no marca el prompt para caché", async () => {
    respondWith({ patient: { name_surnames: "Laura" }, consultation: {} });

    await extractConsultationData("consulta");

    const request = JSON.stringify(createMock.mock.calls[0][0]);
    expect(request).not.toContain("cache_control");
  });

  it("deja vacío un campo ausente en vez de inventarlo", async () => {
    respondWith({
      patient: { name_surnames: "Laura Martín", weight: null, age: 34 },
      consultation: { objetivo_calorias: 1450, medicacion: null },
    });

    const result = await extractConsultationData(
      "Laura, treinta y cuatro años, objetivo mil cuatrocientas cincuenta",
    );

    expect(result.patient.weight).toBeNull();
    expect(result.patient.age).toBe(34);
    expect(result.consultation.medicacion).toBeNull();
    expect(result.consultation.objetivo_calorias).toBe(1450);
  });

  it("falla de forma explícita si la respuesta no trae texto", async () => {
    createMock.mockResolvedValue({ content: [] });

    await expect(extractConsultationData("consulta")).rejects.toThrow(
      /no devolvió contenido/,
    );
  });
});
