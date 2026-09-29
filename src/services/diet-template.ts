import {
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
  FOOTER_POLICY,
  INSTAGRAM_HANDLE,
  INSTAGRAM_METRICS,
  LOGO_METRICS,
  PAGE_METRICS,
} from "@/constants/diet-pdf/brand-tokens";
import {
  escapeHtml,
  renderInline,
  renderMarkdownBlock,
} from "@/services/diet-markdown-inline";
import { parseDietDocument } from "@/services/diet-document-parser";
import type {
  DietDay,
  DietFrontmatter,
  DietProseSection,
  StructuredDietDocument,
} from "@/models/diet-document/diet-document.models";

/**
 * La plantilla de marca: convierte un documento de dieta en la página que ve el
 * usuario en la vista previa y en las piezas que se imprimen a PDF.
 *
 * Es la única maqueta, y todas sus piezas — portada, cuerpo, cabecera y pie —
 * salen de las mismas constantes de `brand-tokens` y `brand-assets`. La
 * cabecera y el pie del PDF se emiten además como documentos sueltos porque
 * Chrome solo sabe repetir algo en cada página a través de
 * `headerTemplate`/`footerTemplate`: lo que se duplica es el CSS, nunca los
 * valores de marca.
 *
 * La marca la pone la plantilla entera. Si el documento trae un logo o un pie
 * escritos en su markdown, salen como texto de la dieta y no sustituyen a los
 * de la plantilla.
 */

/** Alto de la banda superior que ocupa el logo en las páginas de contenido. */
const HEADER_BAND = LOGO_METRICS.content.top + LOGO_METRICS.content.height + 12;

/** Alto de la banda inferior reservada al pie. */
const FOOTER_BAND = PAGE_METRICS.marginBottom;

export interface DietTemplateContext {
  /** Fecha que acompaña a la versión en el pie. Ya formateada. */
  fecha?: string;
}

/**
 * Márgenes que debe reservar `page.pdf()` para que cabecera y pie no pisen el
 * texto.
 *
 * En pulgadas porque Puppeteer no entiende `pt`: acepta px, in, cm y mm, y
 * rechaza el resto con "Failed to parse parameter value". El resto de la
 * plantilla sigue en puntos, que es la unidad del PDF original.
 */
const PT_PER_INCH = 72;

export const PRINT_MARGINS_PT = {
  top: HEADER_BAND,
  bottom: FOOTER_BAND,
  left: PAGE_METRICS.marginX,
  right: PAGE_METRICS.marginX,
} as const;

export const PRINT_MARGINS = {
  top: `${PRINT_MARGINS_PT.top / PT_PER_INCH}in`,
  bottom: `${PRINT_MARGINS_PT.bottom / PT_PER_INCH}in`,
  left: `${PRINT_MARGINS_PT.left / PT_PER_INCH}in`,
  right: `${PRINT_MARGINS_PT.right / PT_PER_INCH}in`,
} as const;

function fontFaces(): string {
  const fonts = [
    ["Tinos", 400, "normal", TINOS_REGULAR_WOFF2],
    ["Tinos", 700, "normal", TINOS_BOLD_WOFF2],
    ["Tinos", 400, "italic", TINOS_ITALIC_WOFF2],
    ["Tinos", 700, "italic", TINOS_BOLD_ITALIC_WOFF2],
    ["Carlito", 400, "normal", CARLITO_REGULAR_WOFF2],
    ["Carlito", 700, "normal", CARLITO_BOLD_WOFF2],
  ] as const;

  return fonts
    .map(
      ([family, weight, style, src]) =>
        `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};font-display:block;src:url(${src}) format("woff2")}`,
    )
    .join("");
}

function tokens(): string {
  return `:root{
  --accent:${BRAND_COLORS.accent};
  --text:${BRAND_COLORS.text};
  --body-size:${FONT_SIZES.body}pt;
  --heading-size:${FONT_SIZES.heading}pt;
  --footer-size:${FONT_SIZES.footer}pt;
}`;
}

function contentStyles(): string {
  return `*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:"Tinos",Times,serif;
  font-size:var(--body-size);
  line-height:1.35;
  color:var(--text);
  background:#fff;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}

.summary{margin-bottom:12pt}
.summary p{margin:0 0 4pt}
.summary .label{font-weight:700;color:var(--accent)}

h2{font-size:var(--heading-size);color:var(--accent);margin:14pt 0 6pt;break-after:avoid}
h3{font-size:var(--heading-size);color:var(--accent);font-weight:400;margin:12pt 0 4pt;break-after:avoid}
h4{font-size:var(--body-size);margin:8pt 0 2pt;text-decoration:underline;break-after:avoid}
p{margin:0 0 4pt}
ul{margin:0 0 4pt;padding-left:18pt}
li{margin:0 0 3pt}
code{font-family:"Courier New",monospace;font-size:0.92em}

/* Las secciones previas al plan van en el registro azul en itálica del
   documento original; el plan semanal, en negro. */
.block--objetivos,.block--suplementacion,.block--cantidades,.block--entreno{
  color:var(--accent);
  font-style:italic;
}

.weekly-plan-title{text-align:center}
/* Un día no se parte entre páginas: su encabezado y sus comidas van juntos. */
.day{break-inside:avoid;margin-bottom:10pt}
.day-note{font-style:italic}
.meal{break-inside:avoid}

.raw{white-space:pre-wrap;font-family:"Carlito",Calibri,sans-serif}`;
}

function coverStyles(): string {
  return `.cover{
  height:${PAGE_METRICS.height}pt;
  padding:${PAGE_METRICS.marginTop}pt ${PAGE_METRICS.marginX}pt 0;
  display:flex;
  flex-direction:column;
  align-items:center;
  text-align:center;
  background:#fff;
}
.cover-rule{width:100%;border-top:1pt solid var(--accent)}
.cover-logo{
  width:${LOGO_METRICS.cover.width}pt;
  height:${LOGO_METRICS.cover.height}pt;
  object-fit:contain;
  margin:18pt 0;
}
.cover-instagram{
  width:${INSTAGRAM_METRICS.width}pt;
  height:${INSTAGRAM_METRICS.height}pt;
  object-fit:contain;
  margin-top:24pt;
}
.cover-handle{font-family:"Carlito",Calibri,sans-serif;font-weight:700;margin:6pt 0 0}
.cover-patient{font-size:var(--heading-size);color:var(--accent);margin-top:28pt;font-weight:700}`;
}

function shell(title: string, style: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${fontFaces()}${tokens()}${style}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function renderCoverBody(frontmatter: DietFrontmatter): string {
  return `<section class="cover">
  <div class="cover-rule"></div>
  <img class="cover-logo" src="${VITALITTY_LOGO_DATA_URI}" alt="Vitalitty">
  <div class="cover-rule"></div>
  <img class="cover-instagram" src="${INSTAGRAM_ICON_DATA_URI}" alt="Instagram">
  <p class="cover-handle">${escapeHtml(INSTAGRAM_HANDLE)}</p>
  <p class="cover-patient">${escapeHtml(frontmatter.paciente)}</p>
</section>`;
}

function renderProseSection(section: DietProseSection): string {
  return `<section class="block block--${section.id}">
  <h2>${renderInline(section.heading)}</h2>
  ${renderMarkdownBlock(section.markdown)}
</section>`;
}

function renderDay(day: DietDay): string {
  const note = day.note
    ? `<span class="day-note">: ${renderInline(day.note)}</span>`
    : "";
  const meals = day.meals
    .map(
      (meal) =>
        `<div class="meal"><h4>${renderInline(meal.label)}</h4>${renderMarkdownBlock(meal.body)}</div>`,
    )
    .join("");

  return `<section class="day day--${day.kind}">
  <h3>${renderInline(day.name)}${note}</h3>
  ${meals}
</section>`;
}

function renderWeeklyPlan(document: StructuredDietDocument): string {
  if (document.days.length === 0) return "";

  return `<section class="weekly-plan">
  <h2 class="weekly-plan-title">${renderInline(document.weeklyPlanHeading ?? "Plan semanal")}</h2>
  ${document.days.map(renderDay).join("")}
</section>`;
}

function renderSummary(frontmatter: DietFrontmatter): string {
  return `<div class="summary">
  <p><span class="label">Próxima revisión:</span> ${escapeHtml(frontmatter.proxima_revision)}</p>
  <p><span class="label">DIETA: ${escapeHtml(frontmatter.calorias)}</span></p>
</div>`;
}

function renderMainBody(document: StructuredDietDocument): string {
  const prose = (only: boolean) =>
    document.sections
      .filter((section) =>
        only ? section.id === "observaciones" : section.id !== "observaciones",
      )
      .map(renderProseSection)
      .join("");

  return `<main>
${renderSummary(document.frontmatter)}
${prose(false)}
${renderWeeklyPlan(document)}
${prose(true)}
</main>`;
}

/**
 * Documento anterior al contrato: se muestra su markdown y no se le aplica la
 * marca, porque no hay forma de repartirlo en la plantilla sin inventarse la
 * estructura.
 */
function renderRaw(markdown: string): string {
  return shell(
    "Dieta",
    contentStyles(),
    `<pre class="raw">${escapeHtml(markdown)}</pre>`,
  );
}

/**
 * El pie, tal y como se verá impreso, para enseñarlo una vez en la vista
 * previa. En pantalla no hay páginas, así que no lleva número de página.
 */
function renderPreviewFooter(
  frontmatter: DietFrontmatter,
  context: DietTemplateContext,
): string {
  const items = FOOTER_POLICY.items
    .map(
      (item) =>
        `<li>${escapeHtml(item.before)}<strong>${escapeHtml(item.strong)}</strong>${escapeHtml(item.after)}</li>`,
    )
    .join("");

  return `<footer class="preview-footer">
<p>${escapeHtml(FOOTER_POLICY.intro)}</p>
<ul>${items}</ul>
<div class="meta">
<span>Versión ${escapeHtml(frontmatter.version)}</span>
<span>${escapeHtml(context.fecha ?? "")}</span>
</div>
</footer>`;
}

function previewFooterStyles(): string {
  return `.preview-footer{
  margin-top:24pt;
  padding-top:8pt;
  border-top:1pt solid var(--accent);
  font-family:"Carlito",Calibri,sans-serif;
  font-size:var(--footer-size);
  line-height:1.25;
}
.preview-footer p{margin:0}
.preview-footer ul{margin:0;padding-left:14pt;list-style:"- "}
.preview-footer .meta{display:flex;gap:16pt;margin-top:3pt;color:var(--accent)}`;
}

/**
 * Vista previa: portada, cuerpo y pie en un flujo continuo.
 *
 * En pantalla no hay páginas, así que la marca aparece una sola vez y no hay
 * corte en hojas ni número de página. Todo lo demás — estructura, orden,
 * tipografías, colores — es exactamente lo que se imprime.
 */
export function renderDietDocumentHtml(
  markdown: string,
  context: DietTemplateContext = {},
): string {
  const document = parseDietDocument(markdown);

  if (document.kind === "raw") return renderRaw(document.markdown);

  return shell(
    `Dieta — ${document.frontmatter.paciente}`,
    `${coverStyles()}${contentStyles()}${previewFooterStyles()}`,
    [
      renderCoverBody(document.frontmatter),
      renderMainBody(document),
      renderPreviewFooter(document.frontmatter, context),
    ].join("\n"),
  );
}

/**
 * Cabecera repetida en cada página de contenido: solo el logo, arriba a la
 * derecha.
 *
 * Va sin `@font-face` a propósito: Chrome renderiza cabecera y pie en un
 * documento aparte y solo se usan aquí imágenes y, en el pie, una sans; cargar
 * las seis variantes otra vez multiplicaría el peso del render sin cambiar
 * nada de lo que se ve.
 */
export function renderPdfHeaderTemplate(): string {
  return `<style>
#h{width:100%;height:${HEADER_BAND}pt;position:relative;-webkit-print-color-adjust:exact}
#h img{position:absolute;top:${LOGO_METRICS.content.top}pt;right:${LOGO_METRICS.content.right}pt;width:${LOGO_METRICS.content.width}pt;height:${LOGO_METRICS.content.height}pt;object-fit:contain}
</style>
<div id="h"><img src="${VITALITTY_LOGO_DATA_URI}"></div>`;
}

/**
 * Pie repetido en cada página de contenido: las condiciones de cambio de cita,
 * la versión, la fecha y el número de página.
 *
 * `.pageNumber` y `.totalPages` los rellena Chrome. Es la única vía que tiene
 * el motor para numerar páginas: los contadores CSS solo cuentan dentro de las
 * *margin boxes* de `@page`, y ahí no caben ni viñetas ni negritas.
 */
export function renderPdfFooterTemplate(
  frontmatter: DietFrontmatter,
  context: DietTemplateContext = {},
): string {
  const items = FOOTER_POLICY.items
    .map(
      (item) =>
        `<li>${escapeHtml(item.before)}<b>${escapeHtml(item.strong)}</b>${escapeHtml(item.after)}</li>`,
    )
    .join("");

  return `<style>
#f{
  width:100%;
  height:${FOOTER_BAND}pt;
  padding:0 ${FOOTER_METRICS.marginX}pt ${FOOTER_METRICS.bottom}pt;
  font-family:Calibri,Carlito,sans-serif;
  font-size:${FONT_SIZES.footer}pt;
  line-height:1.25;
  color:${BRAND_COLORS.text};
  display:flex;
  flex-direction:column;
  justify-content:flex-end;
  -webkit-print-color-adjust:exact;
}
#f p{margin:0}
#f ul{margin:0;padding-left:14pt;list-style:"- "}
#f li{margin:0}
#f .meta{display:flex;justify-content:space-between;margin-top:3pt;color:${BRAND_COLORS.accent}}
</style>
<div id="f">
<p>${escapeHtml(FOOTER_POLICY.intro)}</p>
<ul>${items}</ul>
<div class="meta">
<span>Versión ${escapeHtml(frontmatter.version)}</span>
<span>${escapeHtml(context.fecha ?? "")}</span>
<span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
</div>
</div>`;
}

/** Las dos pasadas de impresión y sus plantillas de cabecera y pie. */
export interface DietPrintPlan {
  cover: string;
  body: string;
  headerTemplate: string;
  footerTemplate: string;
}

/**
 * Prepara el PDF: la portada se imprime sola, sin cabecera ni pie, porque
 * Chrome no sabe suprimirlos en la primera página. Los dos PDF se unen después.
 */
export function planDietPrint(
  markdown: string,
  context: DietTemplateContext = {},
): DietPrintPlan | null {
  const document = parseDietDocument(markdown);

  if (document.kind === "raw") return null;

  return {
    cover: shell(
      `Portada — ${document.frontmatter.paciente}`,
      `${coverStyles()}${contentStyles()}`,
      renderCoverBody(document.frontmatter),
    ),
    body: shell(
      `Dieta — ${document.frontmatter.paciente}`,
      contentStyles(),
      renderMainBody(document),
    ),
    headerTemplate: renderPdfHeaderTemplate(),
    footerTemplate: renderPdfFooterTemplate(document.frontmatter, context),
  };
}
