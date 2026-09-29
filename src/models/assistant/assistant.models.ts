import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lectura o escritura. No es una etiqueta informativa: es lo que decide si una
 * herramienta se ejecuta sola o se le propone al usuario. Va pegada a la
 * definición de cada herramienta a propósito — una lista aparte de "las que
 * escriben" se desincroniza en cuanto alguien añade una, y el fallo sería que
 * una escritura se ejecute sin confirmar.
 */
export type ToolKind = "read" | "write";

/** Esquema JSON de los argumentos, tal como lo espera el modelo. */
export type ToolInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
};

export interface AssistantToolDefinition {
  name: string;
  kind: ToolKind;
  description: string;
  inputSchema: ToolInputSchema;
}

/** Lo que una herramienta necesita para actuar: la sesión del usuario. */
export interface AssistantToolContext {
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Argumentos inválidos o herramienta inexistente. Se le devuelve al modelo como
 * resultado de la herramienta, no como fallo de la conversación: así puede
 * corregir la llamada o explicar que no puede hacerlo.
 */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

/** La herramienta se ejecutó pero no había nada que devolver. */
export class ToolNotFoundError extends Error {
  constructor(message = "No se encuentra ese paciente entre los tuyos.") {
    super(message);
    this.name = "ToolNotFoundError";
  }
}

/**
 * Escritura propuesta y pendiente de confirmación. Viaja al cliente y vuelve
 * en la confirmación, donde se revalida entera: nada de lo que llega aquí se
 * da por bueno por haber sido propuesto antes.
 */
export interface ProposedAction {
  tool: string;
  input: Record<string, unknown>;
  /** Qué se va a hacer, en una frase, para la tarjeta de confirmación. */
  summary: string;
  /** A quién afecta, para que la confirmación no sea a ciegas. */
  patientName?: string;
}

/** Mensaje del hilo tal como lo guarda y reenvía el cliente. */
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Eventos del stream NDJSON, una línea por evento. Mismo formato que
 * `/api/process-consultation`, para reutilizar el patrón de lectura.
 */
export type AssistantEvent =
  | { type: "text"; text: string }
  /**
   * Un documento listo para abrir. Va como evento propio, y no dentro del
   * texto, porque la URL firmada no debe pasar por el modelo: es un enlace a
   * datos de salud, caduca, y pegado en una respuesta se puede truncar o
   * repetir. La pantalla lo pinta como "Ver dieta v17 · 29 sept 2026".
   */
  | {
      type: "document";
      url: string;
      version: number | null;
      fecha: string | null;
    }
  | { type: "tool_start"; tool: string; label: string }
  | { type: "tool_end"; tool: string; ok: boolean }
  | { type: "proposal"; action: ProposedAction }
  | { type: "error"; message: string }
  | { type: "done" };
