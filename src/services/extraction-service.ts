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
// ---------------------------------------------------------------------------
const DIET_TEMPLATE = `# VITALITTY — Plan Nutricional
> @vitalittynutri

---

## Información del Paciente

- **Próxima revisión:** {{proxima_revision}}
- **Calorías objetivo:** {{calorias_entreno}} kcal (días entreno) / {{calorias_descanso}} kcal (días descanso)

---

## Perfil del Paciente

- **Nombre:** {{nombre}}
- **Edad:** {{edad}} años | **Peso:** {{peso}} kg | **Altura:** {{altura}} cm
- **Objetivo:** {{objetivo}}
- **Medicación:** {{medicacion}}
- **Suplementación:** {{suplementacion}}

---

## Objetivos Nutricionales

{{objetivos}}

---

## Distribución de Ingestas

{{distribucion_ingestas}}

---

## Plan Nutricional Semanal

### Lunes — {{tipo_lunes}}

**PRIMERA INGESTA (media mañana)**
{{lunes_primera_ingesta}}

**PRE-ENTRENO** *(si aplica)*
{{lunes_pre_entreno}}

**POST-ENTRENO** *(si aplica)*
{{lunes_post_entreno}}

**COMIDA**
{{lunes_comida}}

**MERIENDA**
{{lunes_merienda}}

**CENA**
{{lunes_cena}}

**PRE-CAMA** *(si aplica)*
{{lunes_pre_cama}}

---

### Martes — {{tipo_martes}}

**PRIMERA INGESTA (media mañana)**
{{martes_primera_ingesta}}

**PRE-ENTRENO** *(si aplica)*
{{martes_pre_entreno}}

**POST-ENTRENO** *(si aplica)*
{{martes_post_entreno}}

**COMIDA**
{{martes_comida}}

**MERIENDA**
{{martes_merienda}}

**CENA**
{{martes_cena}}

**PRE-CAMA** *(si aplica)*
{{martes_pre_cama}}

---

### Miércoles — {{tipo_miercoles}}

**PRIMERA INGESTA (media mañana)**
{{miercoles_primera_ingesta}}

**PRE-ENTRENO** *(si aplica)*
{{miercoles_pre_entreno}}

**POST-ENTRENO** *(si aplica)*
{{miercoles_post_entreno}}

**COMIDA**
{{miercoles_comida}}

**MERIENDA**
{{miercoles_merienda}}

**CENA**
{{miercoles_cena}}

**PRE-CAMA** *(si aplica)*
{{miercoles_pre_cama}}

---

### Jueves — {{tipo_jueves}}

**PRIMERA INGESTA (media mañana)**
{{jueves_primera_ingesta}}

**PRE-ENTRENO** *(si aplica)*
{{jueves_pre_entreno}}

**POST-ENTRENO** *(si aplica)*
{{jueves_post_entreno}}

**COMIDA**
{{jueves_comida}}

**MERIENDA**
{{jueves_merienda}}

**CENA**
{{jueves_cena}}

**PRE-CAMA** *(si aplica)*
{{jueves_pre_cama}}

---

### Viernes — {{tipo_viernes}}

**PRIMERA INGESTA (media mañana)**
{{viernes_primera_ingesta}}

**PRE-ENTRENO** *(si aplica)*
{{viernes_pre_entreno}}

**POST-ENTRENO** *(si aplica)*
{{viernes_post_entreno}}

**COMIDA**
{{viernes_comida}}

**MERIENDA**
{{viernes_merienda}}

**CENA**
{{viernes_cena}}

**PRE-CAMA** *(si aplica)*
{{viernes_pre_cama}}

---

### Sábado — {{tipo_sabado}}

**PRIMERA INGESTA (media mañana)**
{{sabado_primera_ingesta}}

**PRE-ENTRENO** *(si aplica)*
{{sabado_pre_entreno}}

**POST-ENTRENO** *(si aplica)*
{{sabado_post_entreno}}

**COMIDA**
{{sabado_comida}}

**MERIENDA**
{{sabado_merienda}}

**CENA**
{{sabado_cena}}

**PRE-CAMA** *(si aplica)*
{{sabado_pre_cama}}

---

### Domingo — {{tipo_domingo}}

**PRIMERA INGESTA (media mañana)**
{{domingo_primera_ingesta}}

**PRE-ENTRENO** *(si aplica)*
{{domingo_pre_entreno}}

**POST-ENTRENO** *(si aplica)*
{{domingo_post_entreno}}

**COMIDA**
{{domingo_comida}}

**MERIENDA**
{{domingo_merienda}}

**CENA**
{{domingo_cena}}

**PRE-CAMA** *(si aplica)*
{{domingo_pre_cama}}

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

### Técnicas culinarias recomendadas

{{tecnicas_culinarias}}

### Hábitos recomendados

{{habitos}}

---

*¡MUCHO ÁNIMO!*

*Para cambios de cita, avisa con al menos 24 horas de antelación.*
`;

// ---------------------------------------------------------------------------
// System prompt para generateDietMarkdown
// ---------------------------------------------------------------------------
const DIET_SYSTEM_PROMPT = `Eres un dietista-nutricionista colegiado especializado en nutrición deportiva y recomposición corporal.

Tu tarea es rellenar una plantilla Markdown con un plan nutricional completo y profesional basado en la transcripción de una consulta.

## CÁLCULO CALÓRICO
Cuando el nutricionista indique un rango de calorías por kg (ej: "22-26 kcal/kg según actividad"), calcula:
- TMB con fórmula Mifflin-St Jeor: Hombres: (10 × peso_kg) + (6.25 × altura_cm) − (5 × edad) + 5
- TDEE días entrenamiento fuerza (1h): TMB × 1.55
- TDEE días pádel (1.5-2h intensidad media): TMB × 1.375
- TDEE días descanso: TMB × 1.2
- Aplica el déficit indicado (normalmente 300-500 kcal) para pérdida de grasa sin perder músculo
- Si el nutricionista da calorías exactas, úsalas directamente sin recalcular

## DISTRIBUCIÓN DE MACROS para recomposición corporal
- Proteína: 2.0-2.4 g/kg peso corporal (prioridad máxima para preservar músculo)
- Hidratos: mayor cantidad en días de entreno (timing alrededor del ejercicio), reducir en descanso
- Grasas: 0.8-1.2 g/kg, preferencia por insaturadas (aceite oliva, aguacate, frutos secos, pescado azul)
- Fibra: 25-35g/día mínimo

## TIMING NUTRICIONAL DEPORTIVO
- Pre-entreno fuerza: hidratos de absorción media + proteína moderada, 60-90 min antes
- Post-entreno fuerza: proteína rápida (whey si tiene) + hidratos de reposición, ventana 30-45 min
- Pre-entreno pádel nocturno: ingesta ligera 2h antes, fácil digestión
- Post-pádel nocturno (cena tardía): proteína + verduras, mínimos hidratos simples
- Pre-cama: solo si hay gap de más de 8h sin ingesta; caseína o proteína de digestión lenta

## SUPLEMENTACIÓN — integrar en el plan
- Creatina: 3-5g/día (cualquier momento, consistencia es lo clave)
- Proteína whey: post-entreno, o cuando no se alcanza objetivo proteico con la dieta
- Respetar cualquier medicación mencionada (no interacciona con la dieta pero anotarlo)

## ALIMENTOS CONCRETOS — OBLIGATORIO, nunca categorías genéricas
MAL: "proteína magra, verduras"
BIEN: "Pechuga de pollo a la plancha (150g) con arroz integral (80g en seco) y brócoli al vapor"

MAL: "hidratos de carbono"
BIEN: "Avena (60g) con leche semidesnatada (200ml), plátano y nueces (20g)"

Especifica siempre: alimento + cantidad aproximada + técnica de cocinado

## REGLAS DE RELLENO DE PLANTILLA
- Sustituye TODOS los {{campo}} por valores concretos
- Si un campo no aplica ese día (ej: pre-entreno en día de descanso): escribe "—"
- Si un dato personal no aparece en la transcripción (email, teléfono, fecha revisión): escribe "—". NUNCA lo inventes
- {{tipo_lunes}} etc.: "Fuerza", "Pádel", "Descanso" o "Fuerza + Pádel" según el horario del paciente
- {{distribucion_ingestas}}: describe el horario real del paciente extraído de la transcripción
- {{objetivos}}: lista Markdown con - para cada objetivo
- {{habitos}}: lista Markdown con - para cada hábito
- {{tecnicas_culinarias}}: lista Markdown con - para cada técnica
- No añadas texto fuera de la plantilla
- No uses bloques de código markdown (sin triple backtick)
- Devuelve ÚNICAMENTE el Markdown rellenado`;

// ---------------------------------------------------------------------------
// System prompt para extractPatientData
// ---------------------------------------------------------------------------
const EXTRACTION_SYSTEM_PROMPT = `Eres un asistente clínico especializado en extraer datos estructurados de transcripciones de consultas nutricionales.

El nutricionista dicta en voz alta siguiendo un guión estructurado. Tu trabajo es extraer cada campo con máxima precisión.

## REGLAS DE EXTRACCIÓN

### Datos personales
- Nombre: extrae nombre completo tal como se dicta
- Email: normaliza SIEMPRE al formato estándar:
  * "deportesperales arroba gmail punto com" → "deportesperales@gmail.com"
  * "deportes-perales.gmail.com" → "deportesperales@gmail.com"
  * Convierte "arroba" → @, "punto" → .
- Teléfono: elimina guiones y espacios. "657-423574" → "657423574"
- Altura: normaliza siempre a centímetros (número entero)
- Peso: normaliza siempre a kilogramos
- Género: infiere de pronombres y contexto si no se dice explícitamente

### Calorías
- Si se da un rango por kg ("entre 22 y 26 kcal/kg"): calcula el valor medio × peso como objetivo_calorias
- Si se da valor exacto: úsalo directamente
- Captura la justificación o notas de ajuste en objetivo_justificacion

### Actividad física — captura TODO el detalle
- Extrae días, horarios, tipo y duración de CADA actividad por separado
- Ejemplo: "Tres días trabajo de fuerza de una y media a dos y media" → tipo incluye "Fuerza (3 días/semana, 13:30-14:30, 1h)"
- Ejemplo: "Dos días pádel de nueve a diez y media los lunes y jueves" → tipo incluye "Pádel (L/J, 21:00-22:30, 1.5h)"
- Captura también actividad de fin de semana

### Suplementación y medicación
- Extrae nombre, dosis y frecuencia exacta
- "Creatina dos veces al día ocho gramos cuatro y cuatro" → "Creatina 8g/día (4g + 4g)"
- "Finasteride un miligramo diario" → "Finasteride 1mg/día"

### Horario diario
- Extrae el horario completo de ingestas si se menciona
- Incluye hora de despertar, cada ingesta, y hora de dormir

### Si un dato NO se menciona: devuelve null. NUNCA inventes ni estimes.`;

// ---------------------------------------------------------------------------
// Función principal de extracción
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
        content: EXTRACTION_SYSTEM_PROMPT,
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
                  description: "Height in cm, always normalized to integer cm",
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
                objetivo_calorias: {
                  type: ["number", "null"],
                  description:
                    "Target calories. If range given per kg, calculate mid × weight",
                },
                objetivo_descripcion: { type: ["string", "null"] },
                objetivo_tipo: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                objetivo_justificacion: {
                  type: ["string", "null"],
                  description:
                    "Clinical justification or caloric adjustment notes",
                },
                resultados_analiticos: { type: ["string", "null"] },
                suplementos: {
                  type: ["string", "null"],
                  description:
                    "All supplements with dose and frequency, e.g. 'Creatina 8g/día (4g+4g), Proteína whey post-entreno'",
                },
                alergias_intolerancias: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                cirugias: { type: ["string", "null"] },
                medicacion: {
                  type: ["string", "null"],
                  description:
                    "Medication with dose and frequency, e.g. 'Finasteride 1mg/día'",
                },
                patologias: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                actividad_fisica_duracion: {
                  type: ["string", "null"],
                  description:
                    "Duration per session for each activity, e.g. 'Fuerza: 1h | Pádel: 1.5h'",
                },
                actividad_fisica_tipo: {
                  type: ["string", "null"],
                  description:
                    "All activities with days and schedule, e.g. 'Fuerza (L/X/V 13:30-14:30), Pádel (L/J 21:00-22:30 + fin de semana)'",
                },
                actividad_fisica_perfil: {
                  type: ["string", "null"],
                  description:
                    "Activity profile: sedentario / activo / muy activo / deportista",
                },
                actividad_diaria: { type: ["string", "null"] },
                horario_dia_normal: {
                  type: ["string", "null"],
                  description:
                    "Full daily schedule with meal timing extracted from transcription",
                },
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
// Genera el .md de la dieta rellenando la plantilla con la transcripción
// ---------------------------------------------------------------------------
export async function generateDietMarkdown(
  transcription: string,
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: DIET_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `TRANSCRIPCIÓN DE LA CONSULTA:\n${transcription}\n\nPLANTILLA A RELLENAR:\n${DIET_TEMPLATE}`,
      },
    ],
  });

  const result = completion.choices[0].message.content;
  if (!result) {
    throw new Error("No diet markdown generated from OpenAI");
  }

  return result;
}
