import chromium from "@sparticuz/chromium";
import { PDFDocument } from "pdf-lib";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

import { PRINT_MARGINS, planDietPrint } from "@/services/diet-template";
import type { DietTemplateContext } from "@/services/diet-template";

/**
 * Render del PDF de dieta.
 *
 * Imprime la misma plantilla que ve el usuario en la vista previa, así que el
 * PDF no puede desviarse de lo que se aprobó.
 *
 * Es el único módulo que carga Chromium. Por eso vive aparte de la plantilla:
 * la vista previa y la edición no deben arrastrar 50 MB de binario ni pagar su
 * arranque en frío.
 *
 * Son dos pasadas: la portada sin cabecera ni pie, el cuerpo con ellos. Chrome
 * no sabe suprimirlos en la primera página, y `position: fixed` no se repite
 * por página, así que `headerTemplate`/`footerTemplate` es la única vía. Los
 * dos PDF se unen con pdf-lib, que es JS puro y no añade binarios.
 */

/** El documento no sigue el contrato, así que no hay plantilla que aplicarle. */
export class UnstructuredDietError extends Error {
  constructor() {
    super(
      "Esta dieta es anterior al formato con plantilla y solo puede consultarse como markdown.",
    );
    this.name = "UnstructuredDietError";
  }
}

/**
 * Navegador reutilizado dentro de una misma función caliente.
 *
 * Ahorra el arranque en frío cuando llegan varias peticiones seguidas al mismo
 * contenedor. NO es una garantía: la plataforma congela o recicla la función
 * entre invocaciones y el proceso puede haber muerto, de ahí la comprobación de
 * conexión antes de reutilizarlo.
 */
let browserPromise: Promise<Browser> | null = null;

/** En local se imprime con el Chrome instalado; en el despliegue, con el de @sparticuz. */
const LOCAL_CHROME =
  process.env.CHROME_EXECUTABLE_PATH ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined);

const isServerless = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ?? process.env.VERCEL,
);

async function launch(): Promise<Browser> {
  if (isServerless || !LOCAL_CHROME) {
    // @sparticuz/chromium v153 ya no expone `defaultViewport`: el tamaño del
    // papel lo fija `page.pdf()`, así que el viewport no pinta nada aquí.
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  return puppeteer.launch({ executablePath: LOCAL_CHROME, headless: true });
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      // Se relanza más abajo.
    }
  }

  browserPromise = launch();
  return browserPromise;
}

/**
 * Carga el HTML y lo imprime.
 *
 * `setContent` en lugar de navegar a una URL: fuentes, logo y estilos van
 * embebidos, así que el render no hace ni una petición de red y no puede salir
 * con tipografías de reserva.
 */
async function print(
  page: Page,
  html: string,
  options: Parameters<Page["pdf"]>[0],
): Promise<Uint8Array> {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluateHandle("document.fonts.ready");

  return page.pdf({ format: "a4", printBackground: true, ...options });
}

async function concat(parts: Uint8Array[]): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const part of parts) {
    const source = await PDFDocument.load(part);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  return Buffer.from(await merged.save());
}

export async function renderDietPdf(
  markdown: string,
  context: DietTemplateContext = {},
): Promise<Buffer> {
  const plan = planDietPrint(markdown, context);

  if (!plan) throw new UnstructuredDietError();

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    const cover = await print(page, plan.cover, {
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    const body = await print(page, plan.body, {
      displayHeaderFooter: true,
      headerTemplate: plan.headerTemplate,
      footerTemplate: plan.footerTemplate,
      margin: PRINT_MARGINS,
    });

    return concat([cover, body]);
  } finally {
    await page.close();
  }
}
