import { describe, expect, it } from "vitest";

import { LEGACY_DIET_WITHOUT_FRONTMATTER } from "./fixtures/legacy-diet";
import { parseDietDocument } from "@/services/diet-document-parser";
import type {
  RawDietDocument,
  StructuredDietDocument,
} from "@/models/diet-document/diet-document.models";

const FRONTMATTER = `---
paciente: Sandra de Gregorio
version: 5
proxima_revision: 8 de enero de 2026 / 13:00
calorias: 1400-1500 kcal
---`;

const COMPLETE = `${FRONTMATTER}

## Objetivos

- Reducir el porcentaje graso.

## Suplementación

- Creatina, 5 gr al despertar.

## Cantidades

- **Hidrato en comida:** 60 gr.

## Pre/Post-entreno

**PRE-ENTRENO**
Café

## Plan semanal

### Lunes: actividad

**COMIDA**
Salmón al horno con brócoli al vapor

**MERIENDA**
Yogur proteico + mandarina

**CENA**
Ensalada de pollo

### Martes

**COMIDA**
Coliflor cocida y pollo a la plancha

## Observaciones

- Beber 2 litros de agua al día.
`;

function structured(markdown: string): StructuredDietDocument {
  const parsed = parseDietDocument(markdown);
  if (parsed.kind !== "structured") {
    throw new Error(`se esperaba un documento estructurado, no ${parsed.kind}`);
  }
  return parsed;
}

function raw(markdown: string): RawDietDocument {
  const parsed = parseDietDocument(markdown);
  if (parsed.kind !== "raw") {
    throw new Error(`se esperaba un documento en crudo, no ${parsed.kind}`);
  }
  return parsed;
}

describe("documento completo", () => {
  it("lee los cuatro campos del frontmatter", () => {
    expect(structured(COMPLETE).frontmatter).toEqual({
      paciente: "Sandra de Gregorio",
      version: "5",
      proxima_revision: "8 de enero de 2026 / 13:00",
      calorias: "1400-1500 kcal",
    });
  });

  it("devuelve las secciones en el orden del contrato", () => {
    expect(structured(COMPLETE).sections.map((section) => section.id)).toEqual([
      "objetivos",
      "suplementacion",
      "cantidades",
      "entreno",
      "observaciones",
    ]);
  });

  it("conserva el markdown de cada sección sin reescribirlo", () => {
    const cantidades = structured(COMPLETE).sections.find(
      (section) => section.id === "cantidades",
    );

    expect(cantidades?.markdown).toBe("- **Hidrato en comida:** 60 gr.");
  });

  it("lee los días con su anotación y sus comidas", () => {
    const { days } = structured(COMPLETE);

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      name: "Lunes",
      note: "actividad",
      kind: "day",
    });
    expect(days[0].meals.map((meal) => meal.label)).toEqual([
      "COMIDA",
      "MERIENDA",
      "CENA",
    ]);
    expect(days[0].meals[0].body).toBe("Salmón al horno con brócoli al vapor");
    expect(days[1]).toMatchObject({ name: "Martes", note: null, kind: "day" });
  });
});

describe("etiquetas de ingesta reales", () => {
  // Regresión: el generador escribe la hora pegada a la etiqueta y usa nombres
  // fuera de cualquier lista cerrada. Filtrarlas por vocabulario vaciaba los
  // días y el PDF salía con los siete encabezados y ni una sola comida.
  const conHoras = `${FRONTMATTER}

## Plan semanal

### Lunes: fuerza (13:30-14:30) + pádel (21:00-22:30)

**PRIMERA INGESTA (11:00)**
Pan integral tostado con aguacate

**COMIDA (15:00)**
Pechuga de pollo con arroz

**POST-PÁDEL (22:40)**
Batido de proteína whey

**CENA (23:00, tras el pádel)**
Ternera picada magra

**PRE-CAMA (00:30)**
Caseína con agua
`;

  it("acepta cualquier etiqueta en negrita dentro de un día", () => {
    const [lunes] = structured(conHoras).days;

    expect(lunes.meals.map((meal) => meal.label)).toEqual([
      "PRIMERA INGESTA (11:00)",
      "COMIDA (15:00)",
      "POST-PÁDEL (22:40)",
      "CENA (23:00, tras el pádel)",
      "PRE-CAMA (00:30)",
    ]);
  });

  it("conserva el texto de cada ingesta", () => {
    const [lunes] = structured(conHoras).days;

    expect(lunes.meals[0].body).toBe("Pan integral tostado con aguacate");
    expect(lunes.meals[4].body).toBe("Caseína con agua");
  });

  it("ningún día conforme al contrato se queda sin comidas", () => {
    expect(structured(conHoras).days.every((day) => day.meals.length > 0)).toBe(
      true,
    );
  });
});

describe("secciones ausentes y desconocidas", () => {
  it("omite una sección del contrato que no está", () => {
    const sinSuplementacion = COMPLETE.replace(
      "## Suplementación\n\n- Creatina, 5 gr al despertar.\n\n",
      "",
    );

    const ids = structured(sinSuplementacion).sections.map(
      (section) => section.id,
    );

    expect(ids).not.toContain("suplementacion");
    expect(ids).toEqual([
      "objetivos",
      "cantidades",
      "entreno",
      "observaciones",
    ]);
  });

  it("omite una sección del contrato que está vacía", () => {
    const vacia = COMPLETE.replace("- Beber 2 litros de agua al día.\n", "");

    expect(
      structured(vacia).sections.map((section) => section.id),
    ).not.toContain("observaciones");
  });

  it("descarta una sección que no pertenece al contrato", () => {
    const conExtra = COMPLETE.replace(
      "## Observaciones",
      "## Recetas sugeridas\n\n- Crema de calabaza.\n\n## Observaciones",
    );
    const parsed = structured(conExtra);

    expect(parsed.sections.map((section) => section.heading)).not.toContain(
      "Recetas sugeridas",
    );
    expect(parsed.sections.map((section) => section.id)).toContain(
      "observaciones",
    );
  });
});

describe("plan por turnos", () => {
  it("marca los turnos como turnos y no como días", () => {
    const porTurnos = COMPLETE.replace(
      "### Lunes: actividad",
      "### Turno mañana",
    ).replace("### Martes", "### Turno tarde");

    const { days, frontmatter } = structured(porTurnos);

    expect(days.map((day) => day.kind)).toEqual(["shift", "shift"]);
    expect(days.map((day) => day.name)).toEqual([
      "Turno mañana",
      "Turno tarde",
    ]);
    // El frontmatter no crece para distinguir día de turno.
    expect(Object.keys(frontmatter)).toEqual([
      "paciente",
      "version",
      "proxima_revision",
      "calorias",
    ]);
  });
});

describe("documentos que no siguen el contrato", () => {
  it("un documento sin frontmatter va en crudo", () => {
    const parsed = raw("# Plan nutricional\n\nTexto suelto.");

    expect(parsed.reason).toBe("missing-frontmatter");
    expect(parsed.markdown).toContain("Texto suelto.");
  });

  it("un frontmatter incompleto va en crudo", () => {
    const parsed = raw(
      "---\npaciente: Sandra\nversion: 5\n---\n\n## Objetivos\n\n- Algo.\n",
    );

    expect(parsed.reason).toBe("incomplete-frontmatter");
  });

  it("un documento vacío va en crudo sin lanzar", () => {
    expect(raw("   ").reason).toBe("empty");
  });

  it("las dietas guardadas antes del contrato van en crudo", () => {
    // Regresión: las 13+ consultas ya guardadas no llevan frontmatter y deben
    // seguir viéndose, no romper la página.
    const parsed = parseDietDocument(LEGACY_DIET_WITHOUT_FRONTMATTER);

    expect(parsed.kind).toBe("raw");
    expect((parsed as RawDietDocument).reason).toBe("missing-frontmatter");
    expect((parsed as RawDietDocument).markdown).toContain(
      "## Plan nutricional",
    );
  });
});
