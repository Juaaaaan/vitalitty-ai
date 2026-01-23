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
        content: `You are an expert nutritionist assistant. Your goal is to extract structured patient and consultation data from a transcription of a consultation.
        
        The user will provide a transcription text. You must extract two distinct objects:
        1. 'patient': Basic personal information.
        2. 'consultation': Medical, nutritional, and lifestyle details.

        If a field is not mentioned in the text, leave it as null or undefined.
        For 'gender', try to infer 'M' (Male) or 'F' (Female) from context if possible, otherwise 'O'.
        `,
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
                mail: { type: "string" },
                age: { type: "number" },
                phone: { type: "string" },
                gender: { type: "string", enum: ["M", "F", "O"] },
                height: {
                  type: "number",
                  description:
                    "Height in cm or meters (normalize to cm if possible, but schema implies numeric)",
                },
                weight: { type: "number", description: "Weight in kg" },
              },
              required: ["name_surnames"],
            },
            consultation: {
              type: "object",
              properties: {
                objetivo_calorias: { type: "number" },
                objetivo_descripcion: { type: "string" },
                objetivo_tipo: { type: "array", items: { type: "string" } },
                objetivo_justificacion: { type: "string" },
                resultados_analiticos: { type: "string" },
                suplementos: { type: "string" },
                alergias_intolerancias: {
                  type: "array",
                  items: { type: "string" },
                },
                cirugias: { type: "string" },
                medicacion: { type: "string" },
                patologias: { type: "array", items: { type: "string" } },
                actividad_fisica_duracion: { type: "string" },
                actividad_fisica_tipo: { type: "string" },
                actividad_fisica_perfil: { type: "string" },
                actividad_diaria: { type: "string" },
                horario_dia_normal: { type: "string" },
                horas_sueno: { type: "number" },
                cantidad_agua: { type: "string" },
                gustos_preferencias: {
                  type: "array",
                  items: { type: "string" },
                },
                alimentos_evitar: { type: "array", items: { type: "string" } },
                alimentos_priorizar: {
                  type: "array",
                  items: { type: "string" },
                },
              },
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
  if (!content) throw new Error("No content generated from OpenAI");

  return JSON.parse(content);
}
