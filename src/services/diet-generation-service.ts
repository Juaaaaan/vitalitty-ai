import type Anthropic from "@anthropic-ai/sdk";
import anthropic from "../../lib/ai/anthropic";
import { DIET_EXAMPLES } from "@/constants/diet-examples";
import { DIET_CONTRACT_SPEC } from "@/constants/diet-pdf/diet-contract";
import {
  DIET_CONTRACT_PLACEHOLDER,
  PROMPT_TYPE_DIET_GENERATION,
  findDefaultPrompt,
} from "@/constants/brain-prompts";
import { CLINICAL_FIELD_LABELS } from "@/constants/patient-memory";
import type { PatientMemory } from "@/models/patient-context/patient-memory.models";

export const DIET_GENERATION_MODEL = "claude-opus-5";

/**
 * Holgura para una dieta de varias páginas. Quedarse corto trunca el documento
 * a media frase; el streaming evita que un valor alto choque con timeouts HTTP.
 */
const MAX_TOKENS = 32000;

const EDIT_MODE_INSTRUCTIONS = `## MODO REVISIÓN

Este paciente ya tiene una dieta. Vas a **editarla**, no a escribir una nueva desde cero.

- Parte del documento anterior y aplica sobre él lo que dice la transcripción de esta consulta
- Todo lo que la consulta no cuestione se mantiene: mismos alimentos, mismas cantidades, mismas secciones
- Cambia solo lo que la consulta pide cambiar, y lo que dependa directamente de ese cambio
- Actualiza la fecha de próxima revisión si la consulta la menciona
- El resultado debe seguir siendo reconocible como la dieta de este paciente, no un plan distinto`;

function renderExamples(): string {
  return DIET_EXAMPLES.map(
    (example, index) => `### Ejemplo ${index + 1}\n\n${example.markdown}`,
  ).join("\n\n---\n\n");
}

/** Conocimiento de referencia ya seleccionado para esta generación. */
export type BrainDocument = { titulo: string; contenidoMd: string };

/**
 * Lo que el Cerebro aporta al bloque estático: el prompt activo y los
 * documentos seleccionados. Solo contenido — ni ids, ni fechas, ni números de
 * versión: cualquiera de ellos variaría entre llamadas y rompería el prefijo
 * cacheado.
 */
export type BrainContext = {
  promptContent: string;
  documents: readonly BrainDocument[];
};

/**
 * Mete el contrato del documento en el prompt.
 *
 * El prompt activo es editable; el contrato no, porque es lo que lee el parser
 * de la plantilla. Si el prompt trae el marcador, el contrato va donde el
 * marcador dice —así el prompt por defecto compone exactamente el texto de
 * siempre—; si un prompt editado lo ha perdido, el contrato se concatena
 * detrás. De un modo u otro, el contrato está siempre.
 */
function withContract(promptContent: string): string {
  const contractBlock = `\`\`\`\n${DIET_CONTRACT_SPEC}\n\`\`\``;

  if (promptContent.includes(DIET_CONTRACT_PLACEHOLDER)) {
    return promptContent.replaceAll(
      DIET_CONTRACT_PLACEHOLDER,
      DIET_CONTRACT_SPEC,
    );
  }

  return `${promptContent}

## ESTRUCTURA DEL DOCUMENTO — obligatorio

El documento se imprime con una plantilla de marca fija que reconoce estas secciones y solo estas. Una sección con otro nombre no se maqueta: se pierde.

${contractBlock}`;
}

function renderDocuments(documents: readonly BrainDocument[]): string {
  return documents
    .map(({ titulo, contenidoMd }) => `### ${titulo}\n\n${contenidoMd}`)
    .join("\n\n---\n\n");
}

/**
 * Compone el bloque estático: prompt activo -> conocimiento -> ejemplos.
 *
 * Ese orden es el del cacheado y no debe alterarse. El bloque ya no se calcula
 * al cargar el módulo —el prompt y los documentos vienen del Cerebro—, pero
 * sigue siendo idéntico byte a byte entre peticiones mientras no se active una
 * versión nueva: no entra aquí ningún valor que cambie por llamada. Activar una
 * versión invalida la caché a propósito, y eso es exactamente el cambio que se
 * quería que surtiese efecto sin desplegar.
 *
 * Sin contexto del Cerebro compone el prompt por defecto del código, que es la
 * red de seguridad: una tabla vacía no deja una consulta sin dieta.
 */
export function composeStaticPromptBlock(brain?: BrainContext | null): string {
  const fallback = findDefaultPrompt(PROMPT_TYPE_DIET_GENERATION);
  const promptContent = brain?.promptContent?.trim()
    ? brain.promptContent
    : (fallback?.contenido ?? "");

  const sections = [withContract(promptContent)];

  const documents = brain?.documents ?? [];
  if (documents.length > 0) {
    sections.push(
      `## CONOCIMIENTO DE REFERENCIA

Material propio de la consulta, seleccionado para este caso. Vale como criterio
y como fuente de platos y pautas concretas; no sustituye al contrato del
documento ni a lo que diga la consulta de hoy.

${renderDocuments(documents)}`,
    );
  }

  sections.push(`## DIETAS DE EJEMPLO

${renderExamples()}`);

  return sections.join("\n\n");
}

/**
 * Bloque estático compuesto solo con los valores por defecto del código.
 *
 * Es lo que se envía cuando no hay Cerebro que leer, y lo que los tests usan
 * como referencia de "el prompt de siempre".
 */
export const STATIC_PROMPT_BLOCK = composeStaticPromptBlock();

/**
 * Instrucción directa en lugar de transcripción.
 *
 * Va en el bloque variable, nunca en el estático: es lo que permite que el
 * asistente pida un retoque sin invalidar el prefijo cacheado. El texto avisa
 * al modelo de que no hay consulta grabada, porque el bloque estático —que no
 * puede variar— habla siempre de una transcripción.
 */
const INSTRUCTION_MODE_PREAMBLE = `## PETICIÓN DIRECTA, SIN CONSULTA GRABADA

Esta dieta no nace de una consulta dictada: la nutricionista pide un retoque concreto por escrito.

- Aplica exactamente lo pedido y nada más. Lo que la petición no cuestione se mantiene igual
- Sigue valiendo todo lo anterior: el contrato del documento, los alimentos concretos con cantidades y la prohibición de gramos de macronutriente
- Lo que la petición no diga se resuelve con la memoria del paciente y su dieta anterior, nunca con datos inventados`;

export type DietGenerationInput = {
  /**
   * Memoria del paciente existente. `null` para un paciente nuevo: entonces el
   * contexto es solo el bloque estático y lo dicho para esta dieta.
   */
  memory?: PatientMemory | null;
  /**
   * Prompt activo y documentos ya seleccionados por el retrieval. `null` cae a
   * los valores por defecto del código.
   */
  brain?: BrainContext | null;
} & (
  | { transcription: string; instruction?: undefined }
  /** Retoque pedido por escrito, desde el asistente. */
  | { instruction: string; transcription?: undefined }
);

function formatValue(value: string | string[] | number): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/**
 * Bloque de memoria del paciente. Determinista: campos en orden fijo y sin
 * valores "de ahora", para que el mismo paciente produzca el mismo texto.
 */
function renderPatientMemory(memory: PatientMemory): string {
  const { personal, clinical, summaries } = memory;

  const profile: string[] = [];
  if (personal.name_surnames)
    profile.push(`- Nombre: ${personal.name_surnames}`);
  if (personal.age) profile.push(`- Edad: ${personal.age} años`);
  if (personal.gender) profile.push(`- Género: ${personal.gender}`);
  if (personal.height) profile.push(`- Altura: ${personal.height} cm`);
  if (personal.weight) profile.push(`- Peso: ${personal.weight} kg`);
  for (const [field, label] of CLINICAL_FIELD_LABELS) {
    const value = clinical[field];
    if (value != null) profile.push(`- ${label}: ${formatValue(value)}`);
  }

  const sections = [
    `MEMORIA DEL PACIENTE\n\n### Ficha\n\n${profile.length > 0 ? profile.join("\n") : "—"}`,
  ];

  if (summaries.length > 0) {
    const lines = summaries.map(
      ({ version, date, summary }) =>
        `- ${version != null ? `Dieta v${version}` : "Consulta"} (${date}): ${summary}`,
    );
    sections.push(`### Consultas recientes\n\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * Monta el cuerpo de la petición.
 *
 * El orden es deliberado y no debe alterarse: el bloque estático va en `system`
 * con el breakpoint de caché al final, y todo lo que varía por consulta va en
 * `messages`, fuera del prefijo cacheado. Colocar el contexto del paciente
 * dentro del bloque cacheado invalidaría la caché en cada llamada.
 */
export function buildDietGenerationRequest(
  input: DietGenerationInput,
): Anthropic.MessageCreateParamsStreaming {
  const userBlocks: string[] = [];

  const { memory } = input;
  if (memory) {
    userBlocks.push(renderPatientMemory(memory));

    if (memory.lastDietMd) {
      userBlocks.push(
        `${EDIT_MODE_INSTRUCTIONS}\n\nDIETA ANTERIOR DEL PACIENTE\n\n${memory.lastDietMd}`,
      );
    }
  }

  userBlocks.push(
    input.instruction != null
      ? `${INSTRUCTION_MODE_PREAMBLE}\n\nPETICIÓN\n\n${input.instruction}`
      : `TRANSCRIPCIÓN DE LA CONSULTA\n\n${input.transcription}`,
  );

  return {
    model: DIET_GENERATION_MODEL,
    max_tokens: MAX_TOKENS,
    // `medium` acorta el pensamiento y adelanta el primer token visible;
    // `summarized` da algo que mostrar mientras tanto, en vez de un hueco.
    output_config: { effort: "medium" },
    thinking: { type: "adaptive", display: "summarized" },
    system: [
      {
        type: "text",
        text: composeStaticPromptBlock(input.brain),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userBlocks.join("\n\n---\n\n") }],
    stream: true,
  };
}

export type DietGenerationEvent =
  | { type: "text"; text: string }
  /**
   * Resumen del razonamiento, mientras el modelo piensa y antes de que empiece
   * a escribir el documento. Existe para que la pantalla tenga algo que mostrar
   * en ese hueco: sin esto el usuario ve un stream abierto que no escribe nada.
   */
  | { type: "thinking"; text: string }
  | {
      type: "usage";
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      inputTokens: number;
      outputTokens: number;
    };

/**
 * Genera la dieta emitiendo fragmentos conforme llegan.
 *
 * Emite un evento `usage` final con las métricas de caché: si
 * `cacheReadInputTokens` sale cero de forma persistente, o hay un invalidador
 * en el bloque estático o el patrón de uso pide un TTL más largo.
 */
export async function* streamDietGeneration(
  input: DietGenerationInput,
): AsyncGenerator<DietGenerationEvent> {
  const stream = anthropic.messages.stream(buildDietGenerationRequest(input));

  for await (const event of stream) {
    if (event.type !== "content_block_delta") continue;

    if (event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    } else if (event.delta.type === "thinking_delta") {
      yield { type: "thinking", text: event.delta.thinking };
    }
  }

  const final = await stream.finalMessage();

  yield {
    type: "usage",
    cacheReadInputTokens: final.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: final.usage.cache_creation_input_tokens ?? 0,
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
  };
}
