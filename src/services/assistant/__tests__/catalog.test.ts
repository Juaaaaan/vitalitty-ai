import { describe, expect, it, vi } from "vitest";

// read-tools arrastra el servicio de comparación, que crea el cliente del
// modelo al cargarse y revienta en jsdom. Estas pruebas no llaman a ninguno.
vi.mock("../../../../lib/ai/anthropic", () => ({
  default: { messages: { create: vi.fn() } },
}));

import { ASSISTANT_TOOLS, TOOL_LABELS } from "@/services/assistant/catalog";
import { READ_TOOLS } from "@/services/assistant/read-tools";

/**
 * La regla de oro es estructural, no una instrucción del prompt: estas pruebas
 * son las que lo sostienen. Si alguien añade una herramienta de escritura al
 * despachador de lectura, falla aquí y no en producción.
 */
describe("catálogo de herramientas", () => {
  const writeTools = ASSISTANT_TOOLS.filter((tool) => tool.kind === "write");
  const readTools = ASSISTANT_TOOLS.filter((tool) => tool.kind === "read");

  it("ninguna herramienta de escritura es ejecutable desde el despachador de lectura", () => {
    expect(writeTools.length).toBeGreaterThan(0);

    for (const tool of writeTools) {
      expect(READ_TOOLS[tool.name]).toBeUndefined();
    }
  });

  it("toda herramienta de lectura tiene ejecutor", () => {
    for (const tool of readTools) {
      expect(typeof READ_TOOLS[tool.name]).toBe("function");
    }
  });

  it("el despachador de lectura no tiene ejecutores fuera del catálogo", () => {
    const declared = new Set(readTools.map((tool) => tool.name));

    for (const name of Object.keys(READ_TOOLS)) {
      expect(declared.has(name)).toBe(true);
    }
  });

  it("cada herramienta tiene nombre único, esquema cerrado y etiqueta", () => {
    const names = ASSISTANT_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);

    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(TOOL_LABELS[tool.name]).toBeTruthy();

      for (const required of tool.inputSchema.required ?? []) {
        expect(Object.keys(tool.inputSchema.properties)).toContain(required);
      }
    }
  });

  it("generar_dieta y render_pdf son las herramientas que escriben", () => {
    expect(writeTools.map((tool) => tool.name).sort()).toEqual([
      "generar_dieta",
      "render_pdf",
    ]);
  });
});
