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

  it("exige el resumen de la consulta en el schema", async () => {
    respondWith({ patient: { name_surnames: "Laura" }, consultation: {} });

    await extractConsultationData("consulta");

    const schema =
      createMock.mock.calls[0][0].output_config.format.schema.properties
        .consultation;
    expect(schema.properties.consultation_summary.type).toBe("string");
    expect(schema.required).toContain("consultation_summary");
  });

  it("no supera el límite de 16 parámetros con unión de tipos de la API", async () => {
    respondWith({ patient: { name_surnames: "Laura" }, consultation: {} });

    await extractConsultationData("consulta");

    const { schema } = createMock.mock.calls[0][0].output_config.format;
    const unions = [
      ...Object.values(schema.properties.patient.properties),
      ...Object.values(schema.properties.consultation.properties),
    ].filter(
      (property) =>
        Array.isArray((property as { type?: unknown }).type) ||
        "anyOf" in (property as object),
    );
    expect(unions.length).toBeLessThanOrEqual(16);
  });

  it('convierte "" y [] en null: significan "no se menciona"', async () => {
    respondWith({
      patient: { name_surnames: "Laura", mail: "", gender: "" },
      consultation: {
        medicacion: "",
        alergias_intolerancias: [],
        alimentos_evitar: ["marisco"],
        consultation_summary: "",
      },
    });

    const result = await extractConsultationData("consulta");

    expect(result.patient.mail).toBeNull();
    expect(result.patient.gender).toBeNull();
    expect(result.consultation.medicacion).toBeNull();
    expect(result.consultation.alergias_intolerancias).toBeNull();
    expect(result.consultation.alimentos_evitar).toEqual(["marisco"]);
    expect(result.consultation.consultation_summary).toBeNull();
  });

  it("devuelve el resumen tal cual, y null cuando no lo hay", async () => {
    respondWith({
      patient: { name_surnames: "Laura" },
      consultation: { consultation_summary: "Sube la proteína." },
    });
    const withSummary = await extractConsultationData("consulta");
    expect(withSummary.consultation.consultation_summary).toBe(
      "Sube la proteína.",
    );

    respondWith({
      patient: { name_surnames: "Laura" },
      consultation: { consultation_summary: null },
    });
    const withoutSummary = await extractConsultationData("consulta");
    expect(withoutSummary.consultation.consultation_summary).toBeNull();
  });

  it("falla de forma explícita si la respuesta no trae texto", async () => {
    createMock.mockResolvedValue({ content: [] });

    await expect(extractConsultationData("consulta")).rejects.toThrow(
      /no devolvió contenido/,
    );
  });
});
