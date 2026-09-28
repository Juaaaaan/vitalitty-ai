import anthropic from "../../lib/ai/anthropic";
import type {
  ConsultationData,
  PatientData,
} from "@/models/extraction/extraction.models";

export const EXTRACTION_MODEL = "claude-haiku-4-5";

const MAX_TOKENS = 4096;

const EXTRACTION_SYSTEM_PROMPT = `Eres un asistente clínico especializado en extraer datos estructurados de transcripciones de consultas nutricionales.

El nutricionista dicta en voz alta siguiendo un guión estructurado. Tu trabajo es extraer cada campo con máxima precisión.

## REGLAS DE EXTRACCIÓN

### Datos personales
- Nombre: extrae el nombre completo tal como se dicta
- Email: normaliza siempre al formato estándar. "deportesperales arroba gmail punto com" → "deportesperales@gmail.com". Convierte "arroba" → @ y "punto" → .
- Teléfono: elimina guiones y espacios. "657-423574" → "657423574"
- Altura: normaliza siempre a centímetros, número entero
- Peso: normaliza siempre a kilogramos
- Género: infiere de pronombres y contexto si no se dice explícitamente

### Calorías
- Si se da un rango por kg ("entre 22 y 26 kcal/kg"): calcula el valor medio × peso como objetivo_calorias
- Si se da un valor exacto: úsalo directamente
- Captura la justificación o las notas de ajuste en objetivo_justificacion

### Actividad física — captura todo el detalle
- Extrae días, horarios, tipo y duración de cada actividad por separado
- "Tres días trabajo de fuerza de una y media a dos y media" → "Fuerza (3 días/semana, 13:30-14:30, 1h)"
- "Dos días pádel de nueve a diez y media los lunes y jueves" → "Pádel (L/J, 21:00-22:30, 1.5h)"
- Captura también la actividad de fin de semana

### Suplementación y medicación
- Extrae nombre, dosis y frecuencia exactos
- "Creatina dos veces al día ocho gramos cuatro y cuatro" → "Creatina 8g/día (4g + 4g)"
- "Finasteride un miligramo diario" → "Finasteride 1mg/día"

### Horario diario
- Extrae el horario completo de ingestas si se menciona, incluyendo hora de despertar, cada ingesta y hora de dormir

## REGLA QUE NO SE NEGOCIA

Si un dato no se menciona en la transcripción, devuelve null. Nunca lo inventes ni lo estimes a partir de lo que suele ser habitual.`;

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;
const nullableStringArray = {
  type: ["array", "null"],
  items: { type: "string" },
} as const;

const PATIENT_PROPERTIES = {
  name_surnames: { type: "string" },
  mail: nullableString,
  age: nullableNumber,
  phone: nullableString,
  gender: { type: ["string", "null"], enum: ["M", "F", "O", null] },
  height: {
    type: ["number", "null"],
    description: "Altura en cm, siempre normalizada a entero",
  },
  weight: { type: ["number", "null"], description: "Peso en kg" },
} as const;

const CONSULTATION_PROPERTIES = {
  objetivo_calorias: {
    type: ["number", "null"],
    description: "Si se da un rango por kg, calcular la media × peso",
  },
  objetivo_descripcion: nullableString,
  objetivo_tipo: nullableStringArray,
  objetivo_justificacion: nullableString,
  resultados_analiticos: nullableString,
  suplementos: {
    type: ["string", "null"],
    description:
      "Suplementos con dosis y frecuencia, p. ej. 'Creatina 8g/día (4g+4g)'",
  },
  alergias_intolerancias: nullableStringArray,
  cirugias: nullableString,
  medicacion: {
    type: ["string", "null"],
    description:
      "Medicación con dosis y frecuencia, p. ej. 'Finasteride 1mg/día'",
  },
  patologias: nullableStringArray,
  actividad_fisica_duracion: nullableString,
  actividad_fisica_tipo: nullableString,
  actividad_fisica_perfil: {
    type: ["string", "null"],
    description: "sedentario / activo / muy activo / deportista",
  },
  actividad_diaria: nullableString,
  horario_dia_normal: nullableString,
  horas_sueno: nullableNumber,
  cantidad_agua: nullableString,
  gustos_preferencias: nullableStringArray,
  alimentos_evitar: nullableStringArray,
  alimentos_priorizar: nullableStringArray,
} as const;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    patient: {
      type: "object",
      properties: PATIENT_PROPERTIES,
      required: Object.keys(PATIENT_PROPERTIES),
      additionalProperties: false,
    },
    consultation: {
      type: "object",
      properties: CONSULTATION_PROPERTIES,
      required: Object.keys(CONSULTATION_PROPERTIES),
      additionalProperties: false,
    },
  },
  required: ["patient", "consultation"],
  additionalProperties: false,
} as const;

export type ExtractionResult = {
  patient: PatientData;
  consultation: ConsultationData;
};

/**
 * Extrae los campos estructurados de la consulta.
 *
 * Proceso secundario: el documento de dieta es la fuente de verdad y su
 * generación no depende de esto. Corre en paralelo y no bloquea el render.
 *
 * Deliberadamente SIN `cache_control`. El prefijo mínimo cacheable de
 * claude-haiku-4-5 son 4096 tokens y este prompt no llega; marcarlo no daría
 * error, simplemente no cachearía nada en silencio y se pagaría la prima de
 * escritura a cambio de cero lecturas. Si el prompt crece por encima de ese
 * umbral, conviene revisarlo.
 */
export async function extractConsultationData(
  transcription: string,
): Promise<ExtractionResult> {
  const response = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: MAX_TOKENS,
    system: EXTRACTION_SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: EXTRACTION_SCHEMA,
      },
    },
    messages: [{ role: "user", content: transcription }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("La extracción no devolvió contenido de texto");
  }

  return JSON.parse(textBlock.text) as ExtractionResult;
}
