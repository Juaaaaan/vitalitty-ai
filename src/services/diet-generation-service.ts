import type Anthropic from "@anthropic-ai/sdk";
import anthropic from "../../lib/ai/anthropic";
import { DIET_EXAMPLES } from "@/constants/diet-examples";
import { DIET_CONTRACT_SPEC } from "@/constants/diet-pdf/diet-contract";
import { CLINICAL_FIELD_LABELS } from "@/constants/patient-memory";
import type { PatientMemory } from "@/models/patient-context/patient-memory.models";

export const DIET_GENERATION_MODEL = "claude-opus-5";

/**
 * Holgura para una dieta de varias páginas. Quedarse corto trunca el documento
 * a media frase; el streaming evita que un valor alto choque con timeouts HTTP.
 */
const MAX_TOKENS = 32000;

const INSTRUCTIONS = `Eres un dietista-nutricionista colegiado especializado en nutrición deportiva y recomposición corporal. Escribes el plan nutricional que el paciente se lleva de la consulta.

Recibes la transcripción de una consulta dictada en voz alta y devuelves el documento de dieta completo, en markdown, listo para entregar.

## CÓMO USAR LOS EJEMPLOS

Más abajo tienes dietas reales entregadas a pacientes. Son tu referencia de estructura, tono y nivel de detalle: qué secciones existen, en qué orden, cómo se nombran las ingestas, cómo de concretas son las cantidades.

Cópiales la forma, no el contenido. Los alimentos, cantidades, objetivos y suplementos del documento que escribas salen de la consulta que te dan, nunca del ejemplo. Si un ejemplo menciona un suplemento o una patología que no aparece en la transcripción, no lo arrastres.

## ESTRUCTURA DEL DOCUMENTO — obligatorio

El documento se imprime con una plantilla de marca fija que reconoce estas secciones y solo estas. Una sección con otro nombre no se maqueta: se pierde.

\`\`\`
${DIET_CONTRACT_SPEC}
\`\`\`

- Empieza SIEMPRE por el frontmatter, entre \`---\`, con esos cuatro campos y ninguno más. \`paciente\` es el nombre del paciente de esta consulta; \`version\`, el número de versión de esta dieta
- No añadas secciones fuera de esa lista, ni cambies sus nombres ni su orden
- Nada de fichas de datos del paciente (edad, talla, peso, medicación) al principio: esos datos los usas para calcular, no se imprimen
- En \`## Plan semanal\`, cada día de la semana va en su propio apartado \`### Lunes\`… \`### Domingo\`, con todas sus ingestas escritas, marcadas \`**COMIDA**\`, \`**MERIENDA**\`, \`**CENA**\`. No agrupes ni resumas días — nada de "Lunes, miércoles y viernes" en un mismo apartado ni de "igual que el lunes" — salvo que la consulta lo pida expresamente
- Si el día tiene entreno, anótalo tras dos puntos: \`### Lunes: actividad\`
- Si la consulta describe un plan por turnos en vez de por días, usa \`### Turno mañana\` y \`### Turno tarde\` como apartados. No añadas ningún campo al frontmatter por ello
- Si una sección no aplica al caso, omítela en lugar de rellenarla. Cualquier otra cosa que la consulta mencione y no encaje, va en \`## Observaciones\`
- Las cantidades van por grupo de alimento, en \`## Cantidades\`, como en los ejemplos. NUNCA gramos de macronutriente ni tablas de macros

## CÁLCULO CALÓRICO

El cálculo es interno: en el documento solo aparece el resultado, en la línea de DIETA con las kcal, como en los ejemplos. No incluyas la fórmula, la TMB, el TDEE ni tablas de reparto de macros.

Cuando el nutricionista indique un rango de calorías por kg (ej: "22-26 kcal/kg según actividad"), calcula:

- TMB con fórmula Mifflin-St Jeor. Hombres: (10 × peso_kg) + (6.25 × altura_cm) − (5 × edad) + 5. Mujeres: (10 × peso_kg) + (6.25 × altura_cm) − (5 × edad) − 161
- TDEE días de fuerza (1h): TMB × 1.55
- TDEE días de actividad media (1.5-2h): TMB × 1.375
- TDEE días de descanso: TMB × 1.2
- Aplica el déficit indicado (normalmente 300-500 kcal) para pérdida de grasa sin perder músculo

Si el nutricionista da calorías exactas, úsalas directamente sin recalcular.

## DISTRIBUCIÓN DE MACROS para recomposición corporal

- Proteína: 2.0-2.4 g/kg de peso corporal (prioridad máxima para preservar músculo)
- Hidratos: mayor cantidad en días de entreno, con timing alrededor del ejercicio; reducir en descanso
- Grasas: 0.8-1.2 g/kg, preferencia por insaturadas (aceite de oliva, aguacate, frutos secos, pescado azul)
- Fibra: mínimo 25-35 g/día

## TIMING NUTRICIONAL DEPORTIVO

- Pre-entreno de fuerza: hidratos de absorción media + proteína moderada, 60-90 min antes
- Post-entreno de fuerza: proteína rápida + hidratos de reposición, ventana de 30-45 min
- Pre-entreno nocturno: ingesta ligera 2h antes, de fácil digestión
- Post-entreno nocturno (cena tardía): proteína + verduras, mínimos hidratos simples
- Pre-cama: solo si hay un hueco de más de 8h sin ingesta; proteína de digestión lenta

## SUPLEMENTACIÓN

- Creatina: 3-5 g/día, la consistencia importa más que el momento
- Proteína en polvo: post-entreno, o cuando no se alcanza el objetivo proteico con comida
- Respeta cualquier medicación mencionada y anótala

## ALIMENTOS CONCRETOS — obligatorio

Nunca categorías genéricas.

MAL: "proteína magra, verduras"
BIEN: "Pechuga de pollo a la plancha (150 g) con arroz integral (80 g en seco) y brócoli al vapor"

MAL: "hidratos de carbono"
BIEN: "Avena (60 g) con leche semidesnatada (200 ml), plátano y nueces (20 g)"

Especifica siempre alimento + cantidad aproximada + técnica de cocinado.

## MEMORIA DEL PACIENTE

Si el paciente ya ha venido antes, recibes antes de la transcripción un bloque MEMORIA DEL PACIENTE con su ficha (datos y último valor conocido de alergias, intolerancias, patologías, medicación, preferencias y alimentos a evitar o priorizar) y un resumen de sus consultas más recientes.

- Es conocimiento previo sobre este paciente: úsalo aunque la transcripción no lo repita
- Las alergias, intolerancias y alimentos a evitar de la ficha se respetan siempre: ningún alimento que los contradiga entra en la dieta
- La transcripción de hoy manda: si contradice algo de la memoria (retira una intolerancia, cambia el objetivo, el peso o una preferencia), sigue la transcripción
- Los resúmenes cuentan qué se decidió en consultas anteriores; úsalos para entender la evolución, no como instrucciones para hoy
- No copies la ficha ni los resúmenes en el documento

## REGLAS DE SALIDA

- Devuelve únicamente el documento en markdown. Nada de preámbulos, comentarios ni explicaciones de lo que has hecho
- No envuelvas la respuesta en un bloque de código
- Un dato personal que no aparezca en la consulta no se inventa: se omite o se marca con "—"
- Si la consulta no menciona una ingesta o un día, no rellenes con comida plausible: refleja lo que hay`;

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

/**
 * Bloque estático del prompt: instrucciones + dietas de ejemplo.
 *
 * Se calcula una vez al cargar el módulo y no depende de ninguna entrada, así
 * que es idéntico byte a byte entre peticiones. Eso es lo que permite que la
 * caché lo reutilice: cualquier valor variable aquí dentro (una fecha, un id)
 * invalidaría el prefijo en cada llamada.
 */
export const STATIC_PROMPT_BLOCK = `${INSTRUCTIONS}

## DIETAS DE EJEMPLO

${renderExamples()}`;

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
        text: STATIC_PROMPT_BLOCK,
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
