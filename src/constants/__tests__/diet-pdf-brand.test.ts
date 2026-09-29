import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BRAND_IMAGE_RATIOS,
  INSTAGRAM_ICON_DATA_URI,
  VITALITTY_LOGO_DATA_URI,
} from "@/constants/diet-pdf/brand-assets";
import {
  CARLITO_BOLD_WOFF2,
  CARLITO_REGULAR_WOFF2,
  TINOS_BOLD_ITALIC_WOFF2,
  TINOS_BOLD_WOFF2,
  TINOS_ITALIC_WOFF2,
  TINOS_REGULAR_WOFF2,
} from "@/constants/diet-pdf/brand-fonts";
import {
  BRAND_COLORS,
  FONT_SIZES,
  FOOTER_METRICS,
  LOGO_METRICS,
  PAGE_METRICS,
} from "@/constants/diet-pdf/brand-tokens";

/** Bytes de un data URI base64. */
function decode(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  expect(comma).toBeGreaterThan(0);
  return Buffer.from(dataUri.slice(comma + 1), "base64");
}

describe("recursos de marca del PDF", () => {
  it("el logo decodifica a un PNG con canal alfa", () => {
    const png = decode(VITALITTY_LOGO_DATA_URI);

    // Firma PNG.
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    // IHDR: ancho, alto y tipo de color 6 (RGBA).
    expect(png.readUInt32BE(16)).toBe(655);
    expect(png.readUInt32BE(20)).toBe(563);
    expect(png[25]).toBe(6);
  });

  it("el icono de Instagram decodifica a un PNG con canal alfa", () => {
    const png = decode(INSTAGRAM_ICON_DATA_URI);

    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(146);
    expect(png.readUInt32BE(20)).toBe(145);
    expect(png[25]).toBe(6);
  });

  it("las proporciones declaradas coinciden con las imágenes", () => {
    const logo = decode(VITALITTY_LOGO_DATA_URI);
    const ig = decode(INSTAGRAM_ICON_DATA_URI);

    expect(BRAND_IMAGE_RATIOS.logo).toBeCloseTo(
      logo.readUInt32BE(16) / logo.readUInt32BE(20),
      5,
    );
    expect(BRAND_IMAGE_RATIOS.instagram).toBeCloseTo(
      ig.readUInt32BE(16) / ig.readUInt32BE(20),
      5,
    );
  });
});

describe("tipografías de marca", () => {
  const fonts = {
    "Tinos regular": TINOS_REGULAR_WOFF2,
    "Tinos bold": TINOS_BOLD_WOFF2,
    "Tinos italic": TINOS_ITALIC_WOFF2,
    "Tinos bold italic": TINOS_BOLD_ITALIC_WOFF2,
    "Carlito regular": CARLITO_REGULAR_WOFF2,
    "Carlito bold": CARLITO_BOLD_WOFF2,
  };

  it.each(Object.entries(fonts))("%s es un woff2 válido", (_name, dataUri) => {
    const font = decode(dataUri);

    // Cabecera woff2: firma "wOF2" y sfntVersion.
    expect(font.subarray(0, 4).toString("ascii")).toBe("wOF2");
    expect(font.length).toBeGreaterThan(5_000);
  });

  it("las seis variantes suman un peso razonable para el bundle", () => {
    const total = Object.values(fonts).reduce(
      (sum, dataUri) => sum + decode(dataUri).length,
      0,
    );

    // Subconjunto latino: ~94 KB. Si alguien mete la fuente completa se dispara.
    expect(total).toBeLessThan(150_000);
  });
});

describe("tokens de marca", () => {
  it("los colores son los extraídos del PDF de referencia", () => {
    expect(BRAND_COLORS).toEqual({
      accent: "#5B9BD5",
      text: "#000000",
      logoLight: "#5ECAF3",
      logoMid: "#008FD4",
      logoDark: "#00619D",
    });
  });

  it("las medidas de página son las del original", () => {
    expect(PAGE_METRICS.width).toBe(595);
    expect(PAGE_METRICS.height).toBe(842);
    expect(PAGE_METRICS.marginX).toBe(81.7);
    expect(LOGO_METRICS.content).toEqual({
      width: 59.4,
      height: 51.7,
      top: 35.4,
      right: 85.1,
    });
    expect(FONT_SIZES).toEqual({ body: 12, heading: 14, footer: 10 });
  });

  it("el margen inferior reservado supera la altura del pie", () => {
    // El defecto del original: cuerpo hasta 85.1 y pie hasta 87.7, solapados.
    expect(PAGE_METRICS.marginBottom).toBeGreaterThan(
      FOOTER_METRICS.bottom + FOOTER_METRICS.height,
    );
  });
});

describe("independencia del sistema de ficheros", () => {
  it("ningún módulo de la plantilla importa fs ni path", () => {
    const dir = join(process.cwd(), "src/constants/diet-pdf");

    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");

      expect(source).not.toMatch(/from\s+["'](node:)?fs["']/);
      expect(source).not.toMatch(/from\s+["'](node:)?path["']/);
      expect(source).not.toMatch(/require\(["'](node:)?(fs|path)["']\)/);
    }
  });
});
