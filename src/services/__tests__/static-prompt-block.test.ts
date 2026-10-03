import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../../../lib/ai/anthropic", () => ({
  default: { messages: { stream: vi.fn() } },
}));

import {
  composeStaticPromptBlock,
  STATIC_PROMPT_BLOCK,
} from "@/services/diet-generation-service";
import {
  DEFAULT_PROMPTS,
  DIET_CONTRACT_PLACEHOLDER,
  PROMPT_TYPE_DIET_GENERATION,
  findDefaultPrompt,
} from "@/constants/brain-prompts";
import { DIET_CONTRACT_SPEC } from "@/constants/diet-pdf/diet-contract";

/**
 * El bloque estático tal y como lo producía el código antes de que el prompt
 * fuese editable. Es la comprobación que hace válida la semilla: si el prompt
 * sembrado no compone exactamente este texto, la primera generación tras el
 * despliegue cambia de comportamiento sin que nadie haya tocado nada.
 */
const BLOCK_BEFORE_THE_CHANGE = readFileSync(
  "src/services/__tests__/fixtures/static-prompt-block.before.txt",
  "utf8",
);

describe("composeStaticPromptBlock", () => {
  it("con el prompt por defecto reproduce byte a byte el bloque anterior al cambio", () => {
    expect(composeStaticPromptBlock()).toBe(BLOCK_BEFORE_THE_CHANGE);
  });

  it("con el prompt sembrado reproduce byte a byte el bloque anterior al cambio", () => {
    const seeded = findDefaultPrompt(PROMPT_TYPE_DIET_GENERATION);

    expect(
      composeStaticPromptBlock({
        promptContent: seeded!.contenido,
        documents: [],
      }),
    ).toBe(BLOCK_BEFORE_THE_CHANGE);
  });

  it("compone en el orden del cacheado: prompt, conocimiento, ejemplos", () => {
    const block = composeStaticPromptBlock({
      promptContent: `PROMPT ACTIVO ${DIET_CONTRACT_PLACEHOLDER}`,
      documents: [
        { titulo: "Protocolo", contenidoMd: "## Protocolo\n\nTexto" },
      ],
    });

    const prompt = block.indexOf("PROMPT ACTIVO");
    const knowledge = block.indexOf("## CONOCIMIENTO DE REFERENCIA");
    const examples = block.indexOf("## DIETAS DE EJEMPLO");

    expect(prompt).toBeGreaterThanOrEqual(0);
    expect(knowledge).toBeGreaterThan(prompt);
    expect(examples).toBeGreaterThan(knowledge);
  });

  it("incluye el contrato aunque el prompt activo no lo mencione", () => {
    const block = composeStaticPromptBlock({
      promptContent: "Escribe la dieta como te parezca.",
      documents: [],
    });

    expect(block).toContain(DIET_CONTRACT_SPEC);
    expect(block.indexOf(DIET_CONTRACT_SPEC)).toBeGreaterThan(
      block.indexOf("Escribe la dieta como te parezca."),
    );
  });

  it("sustituye el marcador en lugar de dejarlo a la vista", () => {
    const block = composeStaticPromptBlock({
      promptContent: `Antes\n\n${DIET_CONTRACT_PLACEHOLDER}\n\nDespués`,
      documents: [],
    });

    expect(block).not.toContain(DIET_CONTRACT_PLACEHOLDER);
    expect(block).toContain(DIET_CONTRACT_SPEC);
  });

  it("sin documentos no deja el encabezado de conocimiento vacío", () => {
    expect(
      composeStaticPromptBlock({ promptContent: "Prompt", documents: [] }),
    ).not.toContain("## CONOCIMIENTO DE REFERENCIA");
  });

  it("un prompt activo en blanco cae al prompt por defecto", () => {
    expect(
      composeStaticPromptBlock({ promptContent: "   ", documents: [] }),
    ).toBe(BLOCK_BEFORE_THE_CHANGE);
  });

  it("no mete en el bloque nada que varíe entre llamadas", () => {
    const first = composeStaticPromptBlock({
      promptContent: "Prompt",
      documents: [{ titulo: "Doc", contenidoMd: "Texto" }],
    });
    const second = composeStaticPromptBlock({
      promptContent: "Prompt",
      documents: [{ titulo: "Doc", contenidoMd: "Texto" }],
    });

    expect(first).toBe(second);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("el bloque exportado es el compuesto por defecto", () => {
    expect(STATIC_PROMPT_BLOCK).toBe(composeStaticPromptBlock());
  });
});

describe("DEFAULT_PROMPTS", () => {
  it("no se queda vacío", () => {
    expect(DEFAULT_PROMPTS.length).toBeGreaterThan(0);
  });

  it("mantiene el prompt de generación de dieta con contenido y marcador", () => {
    const prompt = findDefaultPrompt(PROMPT_TYPE_DIET_GENERATION);

    expect(prompt).not.toBeNull();
    expect(prompt!.contenido.trim().length).toBeGreaterThan(0);
    expect(prompt!.contenido).toContain(DIET_CONTRACT_PLACEHOLDER);
    expect(prompt!.slug.trim().length).toBeGreaterThan(0);
    expect(prompt!.nombre.trim().length).toBeGreaterThan(0);
  });

  it("no repite slug ni tipo", () => {
    const slugs = DEFAULT_PROMPTS.map((prompt) => prompt.slug);
    const tipos = DEFAULT_PROMPTS.map((prompt) => prompt.tipo);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(tipos).size).toBe(tipos.length);
  });

  it("guarda el contrato como marcador, no expandido", () => {
    for (const prompt of DEFAULT_PROMPTS) {
      expect(prompt.contenido).not.toContain(DIET_CONTRACT_SPEC);
    }
  });
});
