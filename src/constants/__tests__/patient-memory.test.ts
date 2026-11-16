import { describe, expect, it } from "vitest";

import * as messages from "@/constants/patient-memory";

/**
 * Los mensajes los lee la nutricionista con el paciente delante. Un hueco o un
 * resto en inglés se cuela sin que nada falle, así que esta es la alarma.
 */
describe("mensajes de patient-memory", () => {
  const entries = Object.entries(messages).filter(
    ([name, value]) => name.endsWith("_MESSAGE") && typeof value === "string",
  ) as [string, string][];

  it("hay mensajes que comprobar", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("%s no está vacío", (_name, value) => {
    expect(value.trim().length).toBeGreaterThan(0);
  });

  it.each(entries)("%s está en español", (_name, value) => {
    // No es un detector de idioma: busca los restos de inglés que de verdad se
    // cuelan al escribir deprisa.
    expect(value).not.toMatch(
      /\b(the|patient|error|failed|not found|unable|please|try again)\b/i,
    );
  });
});
