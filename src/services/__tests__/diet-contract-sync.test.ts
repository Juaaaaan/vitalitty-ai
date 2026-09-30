import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../../../lib/ai/anthropic", () => ({
  default: { messages: { create: createMock } },
}));

import { DIET_EXAMPLES } from "@/constants/diet-examples";
import {
  DIET_FRONTMATTER_FIELDS,
  DIET_SECTIONS,
} from "@/constants/diet-pdf/diet-contract";
import { parseDietDocument } from "@/services/diet-document-parser";
import { STATIC_PROMPT_BLOCK } from "@/services/diet-generation-service";

/**
 * El contrato lo comparten tres piezas: el prompt que lo exige, los ejemplos
 * que lo cumplen y el parser que lo lee. Si se desincronizan, el generador
 * produce dietas que la plantilla no sabe maquetar y nadie se entera hasta que
 * alguien mira un PDF. Estos tests son esa alarma.
 */

describe("las dietas de ejemplo cumplen el contrato", () => {
  it.each(DIET_EXAMPLES.map((example) => [example.id, example.markdown]))(
    "%s se estructura sin caer a modo crudo",
    (_id, markdown) => {
      const parsed = parseDietDocument(markdown);

      expect(parsed.kind).toBe("structured");
    },
  );

  it.each(DIET_EXAMPLES.map((example) => [example.id, example.markdown]))(
    "%s lleva los cuatro campos del frontmatter y ninguno más",
    (_id, markdown) => {
      const parsed = parseDietDocument(markdown);
      if (parsed.kind !== "structured") throw new Error("no estructurada");

      expect(Object.keys(parsed.frontmatter).sort()).toEqual(
        [...DIET_FRONTMATTER_FIELDS].sort(),
      );
    },
  );

  it.each(DIET_EXAMPLES.map((example) => [example.id, example.markdown]))(
    "%s tiene plan semanal con días y comidas",
    (_id, markdown) => {
      const parsed = parseDietDocument(markdown);
      if (parsed.kind !== "structured") throw new Error("no estructurada");

      expect(parsed.days.length).toBeGreaterThan(0);
      expect(parsed.days.every((day) => day.meals.length > 0)).toBe(true);
    },
  );

  it.each(DIET_EXAMPLES.map((example) => [example.id, example.markdown]))(
    "%s no prescribe macronutrientes",
    (_id, markdown) => {
      expect(markdown.toLowerCase()).not.toContain("macros");
      expect(markdown.toLowerCase()).not.toMatch(
        /gr(amos)? de (prote|hidrat|grasa)\w* totales/,
      );
    },
  );

  it.each(DIET_EXAMPLES.map((example) => [example.id, example.markdown]))(
    "%s no trae presentación: el pie y el logo los pone la plantilla",
    (_id, markdown) => {
      expect(markdown).not.toContain("Los cambios de una cita concertada");
      expect(markdown).not.toContain("@vitalittynutri");
    },
  );
});

describe("el prompt exige el contrato", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("nombra en el bloque estático todas las secciones del contrato", () => {
    const block = STATIC_PROMPT_BLOCK;

    for (const section of DIET_SECTIONS) {
      expect(block).toContain(section.heading);
    }
  });

  it("nombra los cuatro campos del frontmatter", () => {
    const block = STATIC_PROMPT_BLOCK;

    for (const field of DIET_FRONTMATTER_FIELDS) {
      expect(block).toContain(field);
    }
  });

  it("el bloque estático no lleva nada que varíe entre peticiones", () => {
    // Es la única parte cacheable del prompt: una marca de tiempo o un id que
    // cambie dejaría la caché inservible en cada llamada.
    expect(STATIC_PROMPT_BLOCK).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(STATIC_PROMPT_BLOCK).not.toMatch(/Date\.now|Math\.random/);
    expect(STATIC_PROMPT_BLOCK).toBe(STATIC_PROMPT_BLOCK);
  });
});
