/**
 * Colores y medidas de la plantilla de dieta.
 *
 * No son valores elegidos: salen del PDF de referencia
 * `public/diets_example/SANDRA_DE_GREGORIO_5.pdf`, que sí lleva texto y
 * geometría. Los colores son los operadores `sc`/`scn` de su content stream y
 * el muestreo de píxeles del logo; las medidas, las matrices de colocación de
 * sus imágenes y cajas de texto.
 *
 * Todo en puntos PostScript (1 pt = 1/72 in), que es la unidad del PDF y una
 * unidad válida en CSS. Así la plantilla se escribe con los números del
 * original, sin conversiones que introduzcan deriva.
 */

/** Paleta. */
export const BRAND_COLORS = {
  /** Títulos, nombres de día, bloque de objetivos y reglas de la portada. */
  accent: "#5B9BD5",
  /** Cuerpo del plan semanal y pie. */
  text: "#000000",
  /** Círculo del logo. */
  logoLight: "#5ECAF3",
  /** Ala izquierda del logo. */
  logoMid: "#008FD4",
  /** Ala derecha del logo y marca denominativa. */
  logoDark: "#00619D",
} as const;

/** Geometría de la página, en puntos. */
export const PAGE_METRICS = {
  /** A4. */
  width: 595,
  height: 842,
  /** Márgenes laterales de la caja de texto: x = 81.7, ancho 431.5. */
  marginX: 81.7,
  /** Borde superior de la caja de texto en las páginas de contenido. */
  marginTop: 86.6,
  /**
   * Margen inferior reservado para el pie.
   *
   * En el original el cuerpo baja hasta 85.1 y el pie ocupa de 30.7 a 87.7:
   * se solapan 2.6 pt, y por eso en su página 3 el pie tapa una cena. Aquí se
   * reserva la altura del pie más holgura para que eso no pueda ocurrir.
   */
  marginBottom: 100,
} as const;

/** Colocación del logo. */
export const LOGO_METRICS = {
  /** Páginas de contenido: arriba a la derecha. */
  content: { width: 59.4, height: 51.7, top: 35.4, right: 85.1 },
  /** Portada: centrado entre las dos reglas. */
  cover: { width: 205.7, height: 179.2 },
} as const;

/** Icono de Instagram en la portada. */
export const INSTAGRAM_METRICS = { width: 103.3, height: 55.9 } as const;

/** Caja del pie: x = 82.55, ancho 429.9, alto 57, base a 30.7 del borde. */
export const FOOTER_METRICS = {
  marginX: 82.55,
  width: 429.9,
  height: 57,
  bottom: 30.7,
} as const;

/** Tamaños de letra, en puntos. */
export const FONT_SIZES = {
  body: 12,
  heading: 14,
  footer: 10,
} as const;

/**
 * Texto literal de las condiciones de cambio de cita.
 *
 * Es presentación, no contenido: lo pone la plantilla en todas las páginas de
 * contenido y el documento de dieta no puede aportarlo ni sustituirlo.
 */
export const FOOTER_POLICY = {
  intro:
    "Los cambios de una cita concertada deberán comunicarse con 24 horas de antelación, por el contrario:",
  items: [
    {
      before:
        "Aviso previo inferior a 12h: se considerará cita realizada, por lo que se cargará el importe ",
      strong: "INTEGRO",
      after: " en la siguiente cita.",
    },
    {
      before: "Aviso previo entre 12-24h: se aplicará un incremento de ",
      strong: "10€",
      after: " en la siguiente cita. (1/1/20)",
    },
  ],
} as const;

/** Cuenta de Instagram que aparece en la portada. */
export const INSTAGRAM_HANDLE = "@vitalittynutri";
