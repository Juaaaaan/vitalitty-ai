import OpenAI from "openai";
import {
  PatientData,
  ConsultationData,
} from "@/models/extraction/extraction.models";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------------------------------------------------------------
// Plantilla de dieta en Markdown
// Inline para compatibilidad con Vercel serverless (evita readFileSync en runtime)
// ---------------------------------------------------------------------------
const DIET_TEMPLATE = `# VITALITTY — Plan Nutricional
> @vitalittynutri

---

## Información del Paciente

- **Próxima revisión:** {{proxima_revision}}
- **Dieta:** {{calorias}} KCAL

---

## Objetivos

{{objetivos}}

### Entrenamiento

- **Pre-entreno:** {{pre_entreno}}
- **Post-entreno:** {{post_entreno}}

---

## Plan Nutricional Semanal

### Lunes — {{actividad_lunes}}

**COMIDA**
{{lunes_comida}}

**MERIENDA**
{{lunes_merienda}}

**CENA**
{{lunes_cena}}

---

### Martes — {{actividad_martes}}

**COMIDA**
{{martes_comida}}

**MERIENDA**
{{martes_merienda}}

**CENA**
{{martes_cena}}

---

### Miércoles — {{actividad_miercoles}}

**COMIDA**
{{miercoles_comida}}

**MERIENDA**
{{miercoles_merienda}}

**CENA**
{{miercoles_cena}}

---

### Jueves — {{actividad_jueves}}

**COMIDA**
{{jueves_comida}}

**MERIENDA**
{{jueves_merienda}}

**CENA**
{{jueves_cena}}

---

### Viernes — {{actividad_viernes}}

**COMIDA**
{{viernes_comida}}

**MERIENDA**
{{viernes_merienda}}

**CENA**
{{viernes_cena}}

---

### Sábado — {{actividad_sabado}}

**COMIDA**
{{sabado_comida}}

**MERIENDA**
{{sabado_merienda}}

**CENA**
{{sabado_cena}}

---

### Domingo — {{actividad_domingo}}

**COMIDA**
{{domingo_comida}}

**MERIENDA**
{{domingo_merienda}}

**CENA**
{{domingo_cena}}

---

## Observaciones

### Alimentos

- **Aceite:** {{obs_aceite}}
- **Pan:** {{obs_pan}}
- **Refrescos:** {{obs_refrescos}}
- **Verduras:** {{obs_verduras}}
- **Frutos secos:** {{obs_frutos_secos}}
- **Evitar en general:** {{obs_evitar_general}}
- **Evitar en cenas:** {{obs_evitar_cenas}}

### Técnicas culinarias

{{tecnicas_culinarias}}

### Hábitos recomendados

{{habitos}}

---

*¡MUCHO ÁNIMO!*

*Para cambios de cita, avisa con al menos 24 horas de antelación.*
`;

const DIET_SYSTEM_PROMPT = `Eres un asistente especializado en nutrición clínica.
Recibirás dos cosas:
1. La transcripción de un audio de consulta nutricional dictado por el nutricionista Jesús.
2. Una plantilla Markdown con marcadores {{campo}}.

Tu tarea es devolver la plantilla COMPLETAMENTE RELLENADA con los datos extraídos de la transcripción.

REGLAS ESTRICTAS:
- Sustituye TODOS los marcadores {{campo}} por el valor correspondiente.
- Si un dato no aparece en la transcripción, escribe "—" (guión largo).
- No añadas texto extra fuera de la plantilla.
- No incluyas explicaciones, comentarios ni bloques de código markdown (sin triple backtick).
- Devuelve ÚNICAMENTE el Markdown rellenado, listo para guardar como archivo .md.
- Mantén el formato exacto de la plantilla (encabezados, negritas, separadores ---).
- Los campos de actividad ({{actividad_lunes}}, etc.) deben ser "Actividad" o "Descanso".
- {{objetivos}} debe ser una lista Markdown con viñetas (- ítem por línea).
- {{habitos}} debe ser una lista Markdown con viñetas (- ítem por línea).
- {{tecnicas_culinarias}} debe ser una lista Markdown con viñetas (- ítem por línea).
- Las calorías van como número entero sin unidades (ej: 1400).
- La próxima revisión va en formato: "DD de [mes] de YYYY a las HH:MM".
- Si el plan nutricional no fue dictado en el audio, genera uno coherente basándote
  en las calorías, objetivos, preferencias y alimentos a evitar mencionados.`;

// ---------------------------------------------------------------------------
// Función principal de extracción de datos del paciente (sin cambios)
// ---------------------------------------------------------------------------
export async function extractPatientData(transcription: string): Promise<{
  patient: PatientData;
  consultation: ConsultationData;
}> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Eres un nutricionista experto que extrae información relevante de una transcripción de una consulta.
        
        El usuario proporcionará una transcripción de texto. Debes extraer dos objetos distintos:
        1. 'patient': Información personal básica.
        2. 'consultation': Detalles médicos, nutricionales y de estilo de vida.
        
        Si un campo no se menciona en el texto, déjalo como null o undefined.
        Para 'gender', intenta inferir 'M' (Male) o 'F' (Female) del contexto si es posible, de lo contrario 'O'.`,
      },
      {
        role: "user",
        content: transcription,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "extraction_result",
        schema: {
          type: "object",
          properties: {
            patient: {
              type: "object",
              properties: {
                name_surnames: {
                  type: "string",
                  description: "Full name of the patient",
                },
                mail: { type: ["string", "null"] },
                age: { type: ["number", "null"] },
                phone: { type: ["string", "null"] },
                gender: {
                  type: ["string", "null"],
                  enum: ["M", "F", "O", null],
                },
                height: {
                  type: ["number", "null"],
                  description:
                    "Height in cm or meters (normalize to cm if possible, but schema implies numeric)",
                },
                weight: {
                  type: ["number", "null"],
                  description: "Weight in kg",
                },
              },
              required: [
                "name_surnames",
                "mail",
                "age",
                "phone",
                "gender",
                "height",
                "weight",
              ],
              additionalProperties: false,
            },
            consultation: {
              type: "object",
              properties: {
                objetivo_calorias: { type: ["number", "null"] },
                objetivo_descripcion: { type: ["string", "null"] },
                objetivo_tipo: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                objetivo_justificacion: { type: ["string", "null"] },
                resultados_analiticos: { type: ["string", "null"] },
                suplementos: { type: ["string", "null"] },
                alergias_intolerancias: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                cirugias: { type: ["string", "null"] },
                medicacion: { type: ["string", "null"] },
                patologias: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                actividad_fisica_duracion: { type: ["string", "null"] },
                actividad_fisica_tipo: { type: ["string", "null"] },
                actividad_fisica_perfil: { type: ["string", "null"] },
                actividad_diaria: { type: ["string", "null"] },
                horario_dia_normal: { type: ["string", "null"] },
                horas_sueno: { type: ["number", "null"] },
                cantidad_agua: { type: ["string", "null"] },
                gustos_preferencias: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                alimentos_evitar: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                alimentos_priorizar: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
              },
              required: [
                "objetivo_calorias",
                "objetivo_descripcion",
                "objetivo_tipo",
                "objetivo_justificacion",
                "resultados_analiticos",
                "suplementos",
                "alergias_intolerancias",
                "cirugias",
                "medicacion",
                "patologias",
                "actividad_fisica_duracion",
                "actividad_fisica_tipo",
                "actividad_fisica_perfil",
                "actividad_diaria",
                "horario_dia_normal",
                "horas_sueno",
                "cantidad_agua",
                "gustos_preferencias",
                "alimentos_evitar",
                "alimentos_priorizar",
              ],
              additionalProperties: false,
            },
          },
          required: ["patient", "consultation"],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  });

  const content = completion.choices[0].message.content;
  if (!content) {
    throw new Error("No content generated from OpenAI");
  }

  return JSON.parse(content);
}

// ---------------------------------------------------------------------------
// Nueva función: genera el .md de la dieta rellenando la plantilla
// ---------------------------------------------------------------------------
export async function generateDietMarkdown(
  transcription: string,
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0, // Determinista: no inventa, extrae
    messages: [
      {
        role: "system",
        content: DIET_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `TRANSCRIPCIÓN:\n${transcription}\n\nPLANTILLA:\n${DIET_TEMPLATE}`,
      },
    ],
  });

  const result = completion.choices[0].message.content;
  if (!result) {
    throw new Error("No diet markdown generated from OpenAI");
  }

  return result;
}
