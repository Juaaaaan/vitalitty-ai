import {
  DIET_FRONTMATTER_FIELDS,
  DIET_SECTIONS,
  SHIFT_PREFIX,
  WEEKDAYS,
} from "@/constants/diet-pdf/diet-contract";
import type {
  DietDay,
  DietDocument,
  DietFrontmatter,
  DietMeal,
  DietProseSection,
  DietSectionId,
} from "@/models/diet-document/diet-document.models";

/**
 * Lee un documento de dieta y devuelve la estructura que consume la plantilla.
 *
 * Es deliberadamente tolerante en un sentido y estricto en otro: acepta que
 * falten secciones del contrato (las omite), pero no inventa maqueta para
 * secciones que no reconoce ni intenta estructurar un documento sin
 * frontmatter. Las dietas anteriores al contrato caen en ese último caso y se
 * muestran en crudo, que es lo acordado: no hay backfill.
 */

/** Quita acentos y pasa a minúsculas, para comparar encabezados sin depender de la tilde. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

const SECTION_BY_HEADING = new Map(
  DIET_SECTIONS.map((section) => [normalize(section.heading), section.id]),
);

const NORMALIZED_WEEKDAYS = new Set(WEEKDAYS.map(normalize));

/** Separa el frontmatter YAML del cuerpo. Devuelve `null` si no hay frontmatter. */
function splitFrontmatter(
  markdown: string,
): { raw: string; body: string } | null {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);

  if (!match) return null;

  return { raw: match[1], body: markdown.slice(match[0].length) };
}

/**
 * Lee los cuatro campos del contrato.
 *
 * No es un parser de YAML: el frontmatter del contrato son cuatro pares
 * `clave: valor` en una línea cada uno, y traer un parser entero para eso sería
 * superficie de ataque y peso de bundle a cambio de nada.
 */
function parseFrontmatter(raw: string): DietFrontmatter | null {
  const values: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!match) continue;

    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  const missing = DIET_FRONTMATTER_FIELDS.filter((field) => !values[field]);
  if (missing.length > 0) return null;

  return {
    paciente: values.paciente,
    version: values.version,
    proxima_revision: values.proxima_revision,
    calorias: values.calorias,
  };
}

interface HeadingBlock {
  heading: string;
  content: string;
}

/** Trocea el cuerpo por encabezados `##`, conservando el texto de cada uno. */
function splitByHeading(body: string, level: 2 | 3): HeadingBlock[] {
  const marker = "#".repeat(level);
  const pattern = new RegExp(`^${marker} +(.+?)\\s*$`, "gm");
  const blocks: HeadingBlock[] = [];
  const matches = [...body.matchAll(pattern)];

  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end =
      index + 1 < matches.length ? matches[index + 1].index : body.length;

    blocks.push({ heading: match[1].trim(), content: body.slice(start, end) });
  });

  return blocks;
}

/**
 * Decide si un encabezado del plan semanal nombra un día o un turno.
 *
 * Se infiere del propio encabezado y no de un campo del frontmatter: una dieta
 * por turnos no obliga a ampliar el contrato.
 */
function parseDayHeading(heading: string): Omit<DietDay, "meals"> {
  const [namePart, ...rest] = heading.split(":");
  const name = namePart.trim();
  const note = rest.length > 0 ? rest.join(":").trim() || null : null;
  const normalized = normalize(name);
  const kind: DietDay["kind"] = normalized.startsWith(SHIFT_PREFIX)
    ? "shift"
    : NORMALIZED_WEEKDAYS.has(normalized)
      ? "day"
      : "shift";

  return { heading, name, note, kind };
}

/**
 * Lee las ingestas de un día: líneas en negrita seguidas de su texto.
 *
 * Cualquier línea que sea solo `**texto**` cuenta como etiqueta. No se filtra
 * por un vocabulario cerrado a propósito: dentro de `### Lunes` el contexto ya
 * dice que eso es una ingesta, y el generador escribe la hora pegada a la
 * etiqueta (`**COMIDA (15:00)**`) y usa nombres que ninguna lista cubre
 * (`**PRIMERA INGESTA**`, `**POST-PÁDEL**`, `**PRE-CAMA**`). Filtrarlas dejaba
 * los días con su encabezado y sin una sola comida, y el PDF salía con los
 * siete días vacíos.
 */
function parseMeals(content: string): DietMeal[] {
  const pattern = /^\*\*(.+?)\*\*\s*$/gm;
  const matches = [...content.matchAll(pattern)];

  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end =
      index + 1 < matches.length ? matches[index + 1].index : content.length;

    return { label: match[1].trim(), body: content.slice(start, end).trim() };
  });
}

export function parseDietDocument(markdown: string): DietDocument {
  const source = markdown ?? "";

  if (source.trim().length === 0) {
    return { kind: "raw", markdown: source, reason: "empty" };
  }

  const split = splitFrontmatter(source);
  if (!split) {
    return { kind: "raw", markdown: source, reason: "missing-frontmatter" };
  }

  const frontmatter = parseFrontmatter(split.raw);
  if (!frontmatter) {
    return { kind: "raw", markdown: source, reason: "incomplete-frontmatter" };
  }

  const blocks = splitByHeading(split.body, 2);
  const found = new Map<DietSectionId, HeadingBlock>();

  for (const block of blocks) {
    const id = SECTION_BY_HEADING.get(normalize(block.heading));
    // Una sección fuera del contrato no recibe maqueta propia: se descarta.
    // Si se repite una del contrato, manda la primera.
    if (id && !found.has(id)) found.set(id, block);
  }

  // Se recorre el contrato, no el documento: el orden de la maqueta es fijo y
  // una sección ausente simplemente no aparece.
  const sections: DietProseSection[] = [];
  for (const { id, heading } of DIET_SECTIONS) {
    if (id === "plan-semanal") continue;

    const block = found.get(id);
    if (!block) continue;

    const markdownBody = block.content.trim();
    if (markdownBody.length === 0) continue;

    sections.push({
      id,
      heading: block.heading || heading,
      markdown: markdownBody,
    });
  }

  const weeklyPlan = found.get("plan-semanal");
  const days = weeklyPlan
    ? splitByHeading(weeklyPlan.content, 3).map((block) => ({
        ...parseDayHeading(block.heading),
        meals: parseMeals(block.content),
      }))
    : [];

  return {
    kind: "structured",
    frontmatter,
    sections,
    weeklyPlanHeading: weeklyPlan?.heading ?? null,
    days,
  };
}
