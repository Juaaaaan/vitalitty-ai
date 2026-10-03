/** Mensajes y umbrales del Cerebro. Los mensajes dicen qué hacer, no solo qué falló. */

export const BRAIN_SESSION_EXPIRED_MESSAGE =
  "Inicia sesión para abrir el Cerebro.";

export const PROMPT_NOT_FOUND_MESSAGE =
  "No se encuentra ese prompt. Recarga la página y vuelve a abrirlo.";

export const DOCUMENT_NOT_FOUND_MESSAGE =
  "No se encuentra ese documento. Recarga la página y vuelve a abrirlo.";

export const VERSION_NOT_FOUND_MESSAGE =
  "Esa versión no existe o no pertenece a este elemento. Recarga el histórico.";

export const EMPTY_PROMPT_MESSAGE =
  "El prompt no puede estar vacío. Escribe su contenido antes de guardar.";

export const EMPTY_DOCUMENT_MESSAGE =
  "El documento está vacío. Sube un .md con contenido.";

export const UNCHANGED_CONTENT_MESSAGE =
  "No hay cambios respecto a la versión activa, así que no se ha creado una versión nueva.";

/** El rechazo del cliente y el del servidor dicen lo mismo, a propósito. */
export const ONLY_MARKDOWN_MESSAGE =
  "Sube el documento en formato Markdown (.md).";

export const INVALID_DOCUMENT_TYPE_MESSAGE =
  "Elige un tipo de documento de la lista.";

export const SAVE_FAILED_MESSAGE =
  "No se pudo guardar. Inténtalo de nuevo en unos segundos.";

/**
 * Tamaño a partir del cual se avisa del conjunto marcado "siempre incluir".
 *
 * Ese conjunto entra entero en todas las generaciones, así que encarece la
 * llamada en frío posterior a cada cambio en el Cerebro. 120.000 caracteres son
 * ~30.000 tokens. Medido sobre `vault/`: sus seis documentos con contenido
 * suman 181.660 caracteres y el mayor (el compendio de PubMed) son 51.783, así
 * que el umbral deja marcar un par de protocolos sin ruido y avisa en cuanto se
 * intenta meter la biblioteca entera en todas las generaciones, que es el caso
 * que conviene avisar. Cifra provisional: revisarla si el conjunto habitual
 * crece.
 */
export const ALWAYS_INCLUDED_SIZE_WARNING_CHARS = 120_000;

/** Extensión única admitida para el contenido de un documento. */
export const MARKDOWN_EXTENSION = ".md";
