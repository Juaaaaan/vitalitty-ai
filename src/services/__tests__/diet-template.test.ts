import { describe, expect, it } from "vitest";

import { VITALITTY_LOGO_DATA_URI } from "@/constants/diet-pdf/brand-assets";
import { FOOTER_POLICY } from "@/constants/diet-pdf/brand-tokens";
import {
  PRINT_MARGINS,
  PRINT_MARGINS_PT,
  planDietPrint,
  renderDietDocumentHtml,
  renderPdfFooterTemplate,
  renderPdfHeaderTemplate,
} from "@/services/diet-template";
import { LEGACY_DIET_WITHOUT_FRONTMATTER } from "./fixtures/legacy-diet";

function diet(paciente: string, cuerpo: string, version = "5"): string {
  return `---
paciente: ${paciente}
version: ${version}
proxima_revision: 8 de enero de 2026 / 13:00
calorias: 1400-1500 KCAL
---

${cuerpo}`;
}

const DIETA_A = diet(
  "Sandra de Gregorio",
  `## Objetivos

- Reducir el porcentaje graso.

## Plan semanal

### Lunes: actividad

**COMIDA**
Salmón al horno

**CENA**
Ensalada de pollo
`,
);

const DIETA_B = diet(
  "Marta Ruiz",
  `## Objetivos

- Ganar masa muscular.

## Suplementación

- Creatina.

## Plan semanal

### Turno mañana

**COMIDA**
Lentejas con verduras

### Turno tarde

**CENA**
Crema de calabacín
`,
  "2",
);

describe("marca fija", () => {
  it("la portada lleva logo, Instagram y el nombre del paciente", () => {
    const html = renderDietDocumentHtml(DIETA_A);

    expect(html).toContain('class="cover-logo"');
    expect(html).toContain("@vitalittynutri");
    expect(html).toContain("Sandra de Gregorio");
  });

  it("dos dietas distintas comparten portada, estilos y pie byte a byte", () => {
    const planA = planDietPrint(DIETA_A, { fecha: "9 de diciembre de 2025" })!;
    const planB = planDietPrint(DIETA_B, { fecha: "9 de diciembre de 2025" })!;

    // La cabecera es idéntica: no depende del contenido en absoluto.
    expect(planA.headerTemplate).toBe(planB.headerTemplate);

    // El pie solo difiere en la versión, que es dato de la consulta.
    expect(planA.footerTemplate.replace("Versión 5", "Versión N")).toBe(
      planB.footerTemplate.replace("Versión 2", "Versión N"),
    );

    // Y la portada, solo en el nombre del paciente (sale dos veces: en el
    // <title> y en el propio bloque de la portada).
    expect(planA.cover.replaceAll("Sandra de Gregorio", "PACIENTE")).toBe(
      planB.cover.replaceAll("Marta Ruiz", "PACIENTE"),
    );

    // Los estilos del cuerpo son los mismos en ambas.
    const styles = (html: string) =>
      /<style>([\s\S]*?)<\/style>/.exec(html)![1];
    expect(styles(planA.body)).toBe(styles(planB.body));
  });

  it("el documento no puede sustituir la marca de la plantilla", () => {
    const intruso = diet(
      "Sandra",
      `## Objetivos

- Texto con <img src="otro-logo.png"> y @otracuenta y "Los cambios de una cita concertada" inventados.
`,
    );
    const html = renderDietDocumentHtml(intruso);

    // Lo que trae el documento sale escapado, como texto de la dieta.
    expect(html).toContain("&lt;img src=&quot;otro-logo.png&quot;&gt;");
    // Y el logo de la plantilla sigue siendo el único <img> de marca.
    expect(html).toContain(VITALITTY_LOGO_DATA_URI);
  });

  it("el pie lleva el texto literal de las condiciones y la paginación de Chrome", () => {
    const footer = renderPdfFooterTemplate(
      {
        paciente: "Sandra",
        version: "5",
        proxima_revision: "8 de enero",
        calorias: "1400 KCAL",
      },
      { fecha: "9 de diciembre de 2025" },
    );

    expect(footer).toContain(FOOTER_POLICY.intro);
    expect(footer).toContain("<b>INTEGRO</b>");
    expect(footer).toContain("<b>10€</b>");
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
  });

  it("la cabecera solo lleva el logo", () => {
    const header = renderPdfHeaderTemplate();

    expect(header).toContain(VITALITTY_LOGO_DATA_URI);
    expect(header).not.toContain(FOOTER_POLICY.intro);
  });

  it("los márgenes de impresión reservan sitio para cabecera y pie", () => {
    // Si fueran 0, cabecera y pie pisarían el texto: el defecto del original.
    expect(PRINT_MARGINS_PT.top).toBeGreaterThan(80);
    expect(PRINT_MARGINS_PT.bottom).toBeGreaterThan(80);
    // Y Puppeteer solo entiende px, in, cm y mm: un valor en pt lo rechaza.
    expect(PRINT_MARGINS.top).toMatch(/in$/);
    expect(PRINT_MARGINS.bottom).toMatch(/in$/);
  });
});

describe("secciones ausentes y desconocidas", () => {
  it("no deja hueco ni título por una sección que falta", () => {
    const html = renderDietDocumentHtml(DIETA_A);

    expect(html).not.toContain("Suplementación");
    expect(html).not.toContain('class="block block--suplementacion"');
  });

  it("no maqueta una sección fuera del contrato", () => {
    const conExtra = diet(
      "Sandra",
      `## Objetivos

- Algo.

## Recetas sugeridas

- Crema de calabaza.
`,
    );
    const html = renderDietDocumentHtml(conExtra);

    expect(html).not.toContain("Recetas sugeridas");
    expect(html).not.toContain("Crema de calabaza");
  });

  it("distingue días de turnos en la clase del bloque", () => {
    expect(renderDietDocumentHtml(DIETA_A)).toContain('class="day day--day"');
    expect(renderDietDocumentHtml(DIETA_B)).toContain('class="day day--shift"');
  });
});

describe("documentos anteriores al contrato", () => {
  it("se muestran en crudo, sin marca", () => {
    const html = renderDietDocumentHtml(LEGACY_DIET_WITHOUT_FRONTMATTER);

    expect(html).toContain('class="raw"');
    expect(html).not.toContain("cover-logo");
  });

  it("no se pueden imprimir", () => {
    expect(planDietPrint(LEGACY_DIET_WITHOUT_FRONTMATTER)).toBeNull();
  });
});

describe("contenido real del generador", () => {
  // Regresión del PDF de Jesús v16: los siete días salían con su encabezado y
  // ni una sola comida, porque las etiquetas llevan la hora pegada y nombres
  // fuera de cualquier lista cerrada.
  const REAL = diet(
    "Jesús Arsenio García García",
    `## Pre/Post-entreno

**PRE-ENTRENO FUERZA (12:45)**
Plátano (1 mediano) + yogur natural

## Plan semanal

### Lunes: fuerza (13:30-14:30) + pádel (21:00-22:30)

**PRIMERA INGESTA (11:00)**
Pan integral tostado con aguacate

**COMIDA (15:00)**
Pechuga de pollo con arroz

**PRE-CAMA (00:30)**
Caseína con agua

## Observaciones

### Horarios de referencia

- Comida: 15:00.

### Técnicas culinarias recomendadas

- Plancha
`,
    "16",
  );

  it("cada ingesta del día llega al documento con su texto", () => {
    const html = renderDietDocumentHtml(REAL);

    expect(html).toContain("PRIMERA INGESTA (11:00)");
    expect(html).toContain("Pan integral tostado con aguacate");
    expect(html).toContain("COMIDA (15:00)");
    expect(html).toContain("Pechuga de pollo con arroz");
    expect(html).toContain("PRE-CAMA (00:30)");
    expect(html).toContain("Caseína con agua");
  });

  it("ningún día se queda con solo el encabezado", () => {
    const plan = planDietPrint(REAL)!;
    const dias = plan.body.split('<section class="day');

    // El primer trozo es lo anterior al primer día.
    for (const dia of dias.slice(1)) {
      expect(dia).toContain("<h4>");
    }
  });

  it("las etiquetas de pre/post-entreno van en su propia línea", () => {
    const html = renderDietDocumentHtml(REAL);

    expect(html).toContain("<h4>PRE-ENTRENO FUERZA (12:45)</h4>");
    expect(html).not.toContain(
      "<strong>PRE-ENTRENO FUERZA (12:45)</strong> Plátano",
    );
  });

  it("los subtítulos de Observaciones se maquetan, no salen como texto", () => {
    const html = renderDietDocumentHtml(REAL);

    expect(html).toContain("<h4>Horarios de referencia</h4>");
    expect(html).not.toContain("### Horarios de referencia");
  });
});

describe("saltos de página", () => {
  it("cada día es indivisible y sus comidas también", () => {
    const styles = /<style>([\s\S]*?)<\/style>/.exec(
      planDietPrint(DIETA_A)!.body,
    )![1];

    expect(styles).toContain(".day{break-inside:avoid");
    expect(styles).toContain(".meal{break-inside:avoid}");
  });
});
