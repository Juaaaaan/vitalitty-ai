import OpenAI from "openai";
import {
  PatientData,
  ConsultationData,
} from "@/models/extraction/extraction.models";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function extractPatientData(transcription: string): Promise<{
  patient: PatientData;
  consultation: ConsultationData;
}> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o", // Or gpt-4-turbo, using a strong model for extraction
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
