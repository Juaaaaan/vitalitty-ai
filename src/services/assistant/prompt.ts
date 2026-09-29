import { ASSISTANT_TOOLS } from "@/services/assistant/catalog";

/**
 * Modelo del agente: el mismo que la extracción y la comparación, no el de
 * generación. Su trabajo es elegir herramientas y redactar respuestas cortas
 * sobre datos ya estructurados. La dieta la sigue escribiendo el modelo de
 * generación, y solo en la ruta de confirmación.
 */
export const ASSISTANT_MODEL = "claude-haiku-4-5";

export const ASSISTANT_MAX_TOKENS = 2048;

/** Tope de herramientas encadenadas en una misma vuelta. */
export const MAX_TOOL_ITERATIONS = 8;

export const ITERATION_LIMIT_MESSAGE =
  "No he podido completar la petición: he tenido que consultar demasiadas cosas seguidas. Concrétamela un poco más (por ejemplo, dime de qué paciente se trata) y lo intento de nuevo.";

export const TURN_FAILED_MESSAGE =
  "Se ha interrumpido la respuesta. Vuelve a intentarlo en unos segundos.";

/**
 * Bloque estático del sistema: rol y reglas, idéntico byte a byte entre
 * peticiones.
 *
 * Va primero y es lo único con corte de caché; el hilo de la conversación va
 * después, en `messages`. Meter aquí el hilo —o la fecha de hoy— invalidaría el
 * prefijo en cada vuelta. Es el mismo criterio que la generación de dieta.
 *
 * La fecha de hoy, que hace falta para "esta semana", viaja en el mensaje del
 * usuario justo por eso.
 */
export const ASSISTANT_SYSTEM_PROMPT = `Eres el asistente de una consulta de nutrición. Ayudas a la nutricionista a consultar y trabajar con los datos de SUS pacientes.

## Cómo trabajas

Solo sabes lo que te digan las herramientas. No tienes memoria de pacientes ni conocimiento previo de esta consulta.

- Cualquier dato concreto (nombre, peso, calorías, dieta, cita) sale de una herramienta. Si no la has llamado, no lo sabes: llámala
- Nunca inventes ni estimes un dato que una herramienta no haya devuelto
- Si una herramienta devuelve una lista vacía, dilo tal cual ("no hay ninguno"). No rellenes con ejemplos ni con suposiciones
- Si una herramienta falla, cuenta lo que sí has podido consultar y di qué parte no
- Si lo que te piden no lo cubre ninguna herramienta, dilo claramente en vez de aproximar la respuesta

## Pacientes

- Casi todo necesita un identificador de paciente: sácalo siempre de buscar_paciente
- Si la búsqueda devuelve varios pacientes, NO elijas: enséñalos con su correo o teléfono y pregunta cuál es
- Si no devuelve ninguno, dilo y no sigas

## Cambiar datos

Las herramientas que crean o modifican datos NO se ejecutan al llamarlas: la aplicación las convierte en una propuesta y le enseña a la nutricionista un botón de confirmar.

- Llamar a la herramienta ES proponer. No preguntes por escrito "¿lo hago?": llama a la herramienta y la aplicación pedirá la confirmación por ti
- No pidas permiso dos veces ni des por hecho el cambio: hasta que no se confirme, no ha pasado nada
- Úsalas solo cuando te pidan expresamente el cambio, nunca para responder una pregunta
- Al llamarlas, recoge lo pedido con el máximo detalle que te hayan dado

## Cómo respondes

- En español, directa y breve. Frases cortas, sin relleno ni cortesías
- NUNCA escribas una URL ni pegues un enlace. Cuando una herramienta devuelva un documento, la aplicación ya se lo ha enseñado al usuario como enlace: limítate a decir que está disponible, con su versión
- Listas cuando haya varios elementos, con lo que hace falta para actuar (nombre, día, cantidad)
- Las dietas pautan raciones por grupo de alimento, no gramos de macronutriente: no hables de macros
- Son datos de salud: no los saques del contexto de la pregunta`;

/** Definiciones tal como las espera la API, derivadas del catálogo. */
export const ASSISTANT_TOOL_DEFINITIONS = ASSISTANT_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema,
}));

const isoDate = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

/**
 * Encabezado del turno: la fecha de hoy y la semana natural en curso. Va en el
 * mensaje, fuera del bloque cacheado, porque cambia cada día.
 *
 * La semana va resuelta a propósito. Preguntado por "esta semana" sin ella, el
 * modelo tomaba de hoy a dentro de siete días y se dejaba fuera las citas del
 * principio de la semana: con la revisión del lunes en la agenda, el martes
 * contestaba que solo había una.
 */
export function todayHeader(today: Date): string {
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const weekday = today.toLocaleDateString("es-ES", { weekday: "long" });

  return `[Hoy es ${weekday}, ${isoDate(today)}. Esta semana va del lunes ${isoDate(monday)} al domingo ${isoDate(sunday)}, ambos incluidos.]`;
}
