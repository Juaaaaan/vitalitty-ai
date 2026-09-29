import {
  ToolInputError,
  type AssistantToolDefinition,
  type ToolInputSchema,
} from "@/models/assistant/assistant.models";

/**
 * Catálogo cerrado de herramientas de dominio del asistente.
 *
 * Aquí solo vive **qué** puede pedir el modelo: nombre, descripción, esquema de
 * argumentos, su clasificación lectura/escritura y la validación de lo que
 * llega. Ni base de datos ni modelo, para que tanto el bucle del agente como la
 * ruta de confirmación puedan cargarlo sin arrastrar un ejecutor que no van a
 * usar (la del bucle, en particular, no debe cargar Chromium).
 *
 * El modelo nunca ve SQL, shell ni ficheros: solo estos nombres.
 */

/** Criterios que `pacientes_por_criterio` sabe responder, y solo estos. */
export const PATIENT_CRITERIA = [
  "citas_en_rango",
  "sin_consulta_desde",
  "sin_dieta",
] as const;

export type PatientCriterion = (typeof PATIENT_CRITERIA)[number];

export const APPOINTMENT_TYPES = [
  "seguimiento",
  "primera_cita",
  "revision",
  "urgente",
  "bloqueo",
] as const;

/** Tope de resultados de una búsqueda: el hilo no es sitio para un listado. */
export const SEARCH_LIMIT = 10;

/** Versiones de dieta cuyo documento completo se devuelve entero. */
export const FULL_DOCUMENT_LIMIT = 2;

/** Tope de versiones que `get_dietas` devuelve de una vez. */
export const DIETS_LIMIT = 10;

const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
): ToolInputSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const PATIENT_ID = {
  type: "string",
  description:
    "Identificador del paciente, tal como lo devuelve buscar_paciente",
};

export const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  {
    name: "buscar_paciente",
    kind: "read",
    description:
      "Busca pacientes del usuario por nombre o correo y devuelve su identificador, nombre, correo y teléfono. Úsala siempre antes de cualquier herramienta que pida un identificador de paciente. Si devuelve varios, pregunta al usuario cuál es: no elijas por tu cuenta.",
    inputSchema: object(
      {
        texto: {
          type: "string",
          description: "Nombre, apellido o correo, entero o en parte",
        },
      },
      ["texto"],
    ),
  },
  {
    name: "get_paciente",
    kind: "read",
    description:
      "Ficha de un paciente: datos personales, último valor conocido de sus campos clínicos (alergias, intolerancias, patologías, medicación, preferencias, alimentos a evitar o priorizar) y resúmenes de sus consultas recientes. No devuelve documentos de dieta.",
    inputSchema: object({ paciente_id: PATIENT_ID }, ["paciente_id"]),
  },
  {
    name: "get_dietas",
    kind: "read",
    description: `Versiones de dieta de un paciente, de la más reciente a la más antigua, con su número de versión, fecha, calorías objetivo y si tienen PDF. El documento completo solo se devuelve si se piden ${FULL_DOCUMENT_LIMIT} versiones o menos.`,
    inputSchema: object(
      {
        paciente_id: PATIENT_ID,
        n: {
          type: "integer",
          description: `Cuántas versiones quieres, de 1 a ${DIETS_LIMIT}. Por defecto 1, la última`,
        },
      },
      ["paciente_id"],
    ),
  },
  {
    name: "comparar_dietas",
    kind: "read",
    description:
      "Compara dos versiones de dieta de un paciente: calorías, peso, raciones por grupo de alimento con su diferencia, alimentos que entran y salen, y un resumen de qué cambió y por qué. Solo compara pares consecutivos: si le das dos versiones que no lo son, compara la más reciente con su anterior y lo dice.",
    inputSchema: object(
      {
        paciente_id: PATIENT_ID,
        version_a: { type: "integer", description: "Una de las dos versiones" },
        version_b: { type: "integer", description: "La otra versión" },
      },
      ["paciente_id", "version_a", "version_b"],
    ),
  },
  {
    name: "estadisticas_paciente",
    kind: "read",
    description:
      "Evolución del paciente a lo largo de sus consultas: calorías objetivo, peso y raciones por grupo de alimento, con fecha y versión de dieta. No devuelve macronutrientes: las dietas pautan raciones por grupo, no macros.",
    inputSchema: object({ paciente_id: PATIENT_ID }, ["paciente_id"]),
  },
  {
    name: "pacientes_por_criterio",
    kind: "read",
    description: `Pacientes del usuario que cumplen un criterio. "citas_en_rango" necesita desde y hasta (y admite tipos, p. ej. ["revision"]); "sin_consulta_desde" necesita desde; "sin_dieta" no necesita fechas. Cualquier otro criterio no se puede responder.`,
    inputSchema: object(
      {
        criterio: {
          type: "string",
          enum: [...PATIENT_CRITERIA],
          description: "Qué se busca",
        },
        desde: {
          type: "string",
          description: "Fecha inicial incluida, en formato YYYY-MM-DD",
        },
        hasta: {
          type: "string",
          description: "Fecha final incluida, en formato YYYY-MM-DD",
        },
        tipos: {
          type: "array",
          items: { type: "string", enum: [...APPOINTMENT_TYPES] },
          description: "Tipos de cita, solo para citas_en_rango",
        },
      },
      ["criterio"],
    ),
  },
  {
    name: "generar_dieta",
    kind: "write",
    description:
      "Genera una versión nueva de la dieta de un paciente aplicando un retoque pedido por escrito, partiendo de su última dieta. Llamarla NO guarda nada ni genera nada todavía: la aplicación la convierte en una propuesta y pide confirmación al usuario. Llámala directamente cuando te pidan el cambio, sin preguntar antes si lo haces.",
    inputSchema: object(
      {
        paciente_id: PATIENT_ID,
        instrucciones: {
          type: "string",
          description:
            "El retoque pedido, con sus propias palabras y con todo el detalle que haya dado",
        },
      },
      ["paciente_id", "instrucciones"],
    ),
  },
  {
    name: "render_pdf",
    kind: "write",
    description:
      "Entrega el PDF de marca de una dieta. Si ya existe y corresponde al documento actual, devuelve su enlace sin más. Si hay que crearlo, llamarla no lo crea: la aplicación pide confirmación al usuario. Llámala directamente, sin preguntar antes.",
    inputSchema: object(
      {
        consulta_id: {
          type: "string",
          description:
            "Identificador de la consulta de esa dieta, tal como lo devuelve get_dietas",
        },
      },
      ["consulta_id"],
    ),
  },
];

const BY_NAME = new Map(ASSISTANT_TOOLS.map((tool) => [tool.name, tool]));

export function findTool(name: string): AssistantToolDefinition | undefined {
  return BY_NAME.get(name);
}

export function isWriteTool(name: string): boolean {
  return findTool(name)?.kind === "write";
}

/** Etiqueta para la pantalla mientras la herramienta corre. */
export const TOOL_LABELS: Record<string, string> = {
  buscar_paciente: "Buscando el paciente…",
  get_paciente: "Consultando la ficha…",
  get_dietas: "Consultando sus dietas…",
  comparar_dietas: "Comparando las dietas…",
  estadisticas_paciente: "Consultando su evolución…",
  pacientes_por_criterio: "Consultando la agenda…",
  generar_dieta: "Preparando el retoque…",
  render_pdf: "Preparando el PDF…",
};

/* -------------------------------------------------------------------------- */
/* Validación de argumentos                                                   */
/* -------------------------------------------------------------------------- */

function asRecord(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new ToolInputError("Los argumentos deben ser un objeto.");
  }
  return input as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ToolInputError(`Falta ${key}, o no es un texto con contenido.`);
  }
  return value.trim();
}

function optionalInteger(
  input: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = input[key];
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ToolInputError(`${key} debe ser un número entero.`);
  }
  return value;
}

function requiredInteger(input: Record<string, unknown>, key: string): number {
  const value = optionalInteger(input, key);
  if (value == null) throw new ToolInputError(`Falta ${key}.`);
  return value;
}

/**
 * Fecha en formato YYYY-MM-DD. Se valida el formato **y** que exista: "2026-02-31"
 * pasa un regex y luego se convierte en marzo sin avisar.
 */
function parseDate(input: Record<string, unknown>, key: string): Date {
  const value = requiredString(input, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ToolInputError(`${key} debe tener el formato YYYY-MM-DD.`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new ToolInputError(`${key} no es una fecha válida.`);
  }

  return date;
}

export type SearchPatientInput = { texto: string };
export type PatientInput = { pacienteId: string };
export type DietsInput = { pacienteId: string; n: number };
export type CompareInput = {
  pacienteId: string;
  versionA: number;
  versionB: number;
};
export type CriterionInput = {
  criterio: PatientCriterion;
  /** Instante inicial incluido, ya resuelto en la zona del servidor. */
  from?: Date;
  /** Instante final EXCLUIDO: el día `hasta` entra completo. */
  to?: Date;
  tipos?: string[];
};
export type GenerateDietInput = { pacienteId: string; instrucciones: string };
export type RenderPdfInput = { consultaId: string };

export const parseSearchPatient = (input: unknown): SearchPatientInput => ({
  texto: requiredString(asRecord(input), "texto"),
});

export const parsePatient = (input: unknown): PatientInput => ({
  pacienteId: requiredString(asRecord(input), "paciente_id"),
});

export function parseDiets(input: unknown): DietsInput {
  const record = asRecord(input);
  const n = optionalInteger(record, "n") ?? 1;

  if (n < 1 || n > DIETS_LIMIT) {
    throw new ToolInputError(`n debe estar entre 1 y ${DIETS_LIMIT}.`);
  }

  return { pacienteId: requiredString(record, "paciente_id"), n };
}

export function parseCompare(input: unknown): CompareInput {
  const record = asRecord(input);
  const versionA = requiredInteger(record, "version_a");
  const versionB = requiredInteger(record, "version_b");

  if (versionA === versionB) {
    throw new ToolInputError(
      "version_a y version_b son la misma: hacen falta dos versiones distintas.",
    );
  }

  return {
    pacienteId: requiredString(record, "paciente_id"),
    versionA,
    versionB,
  };
}

export function parseCriterion(input: unknown): CriterionInput {
  const record = asRecord(input);
  const criterio = record.criterio;

  if (
    typeof criterio !== "string" ||
    !PATIENT_CRITERIA.includes(criterio as PatientCriterion)
  ) {
    throw new ToolInputError(
      `No puedo filtrar por ese criterio. Los que sé responder son: ${PATIENT_CRITERIA.join(", ")}.`,
    );
  }

  const parsed: CriterionInput = { criterio: criterio as PatientCriterion };

  if (criterio === "citas_en_rango" || criterio === "sin_consulta_desde") {
    parsed.from = parseDate(record, "desde");
  }

  if (criterio === "citas_en_rango") {
    // `hasta` es un día natural que entra entero: el rango acaba al empezar el
    // día siguiente, para no perderse la cita de las 19:00 del último día.
    const until = parseDate(record, "hasta");
    until.setDate(until.getDate() + 1);
    parsed.to = until;

    if (parsed.from && parsed.to <= parsed.from) {
      throw new ToolInputError("hasta debe ser igual o posterior a desde.");
    }

    const tipos = record.tipos;
    if (tipos != null) {
      if (
        !Array.isArray(tipos) ||
        tipos.some(
          (type) =>
            typeof type !== "string" ||
            !APPOINTMENT_TYPES.includes(
              type as (typeof APPOINTMENT_TYPES)[number],
            ),
        )
      ) {
        throw new ToolInputError(
          `tipos debe ser una lista de: ${APPOINTMENT_TYPES.join(", ")}.`,
        );
      }
      parsed.tipos = tipos as string[];
    }
  }

  return parsed;
}

export const parseGenerateDiet = (input: unknown): GenerateDietInput => {
  const record = asRecord(input);
  return {
    pacienteId: requiredString(record, "paciente_id"),
    instrucciones: requiredString(record, "instrucciones"),
  };
};

export const parseRenderPdf = (input: unknown): RenderPdfInput => ({
  consultaId: requiredString(asRecord(input), "consulta_id"),
});
