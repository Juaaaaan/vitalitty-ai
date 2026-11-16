/**
 * Cómo se dice en consulta lo que en el vault es una etiqueta.
 *
 * La ficha del paciente no está etiquetada: es prosa dictada y luego extraída,
 * así que dice "aumentar masa muscular" donde el documento dice `hipertrofia`,
 * y "celiaquía" donde el documento dice `gluten`. Cruzar las dos listas por
 * igualdad no casa nunca —se midió: de seis documentos entraba solo el de
 * inclusión incondicional—, así que el cruce se hace al revés: se mira si la
 * etiqueta del documento, o cualquiera de sus sinónimos, aparece en el texto de
 * la ficha.
 *
 * La etiqueta siempre se busca a sí misma; esta tabla solo añade las otras
 * formas de nombrarla. Es vocabulario clínico, no código: **está sembrada con
 * lo evidente y la dueña de la consulta es quien la completa.** Añadir una
 * forma de decir algo es añadir una cadena a su lista.
 *
 * Cada entrada se compara normalizada —minúsculas, sin acentos— y como palabra
 * o frase completa, para que `pms` no entre por "pmsx" ni `mujer` por
 * "mujeres"… (ojo: por eso los plurales se ponen explícitos cuando importan).
 */
export const BRAIN_TAG_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  hipertrofia: [
    "masa muscular",
    "aumentar masa muscular",
    "ganar musculo",
    "recomposicion corporal",
    "fuerza",
  ],
  microbiota: [
    "intestinal",
    "digestivo",
    "digestiva",
    "sibo",
    "colon irritable",
    "estrenimiento",
    "hinchazon",
    "disbiosis",
  ],
  pms: [
    "premenstrual",
    "sindrome premenstrual",
    "menstrual",
    "menstruacion",
    "regla",
    "ciclo menstrual",
  ],
  gluten: ["celiaquia", "celiaca", "celiaco", "sin gluten"],
  lactosa: ["intolerancia a la lactosa", "sin lactosa", "lacteos"],
  suplementacion: ["suplemento", "suplementos", "suplementacion"],
  creatina: ["creatina"],
  proteina: ["proteina", "proteico", "proteica"],
  platos: ["platos", "recetas", "variedad", "ideas de platos"],
  mujer: ["mujer", "femenino"],
};

/** Quita acentos y pasa a minúsculas: las dos caras del cruce se comparan así. */
export function normalizeForTagMatch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * ¿Describe esta etiqueta al paciente de este texto?
 *
 * `profileText` es la ficha entera ya normalizada. Se busca la etiqueta y sus
 * sinónimos como palabra o frase completa, no como subcadena: `pms` no debe
 * entrar por "pmsx", ni `fuerza` por "esfuerzo".
 */
export function tagMatchesProfile(tag: string, profileText: string): boolean {
  const normalizedTag = normalizeForTagMatch(tag).trim();
  if (normalizedTag.length === 0) return false;

  const candidates = [
    normalizedTag,
    ...(BRAIN_TAG_SYNONYMS[normalizedTag] ?? []).map(normalizeForTagMatch),
  ];

  return candidates.some((candidate) => {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(profileText);
  });
}
