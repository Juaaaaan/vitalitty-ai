/**
 * El choque de identidad: los datos extraídos de una consulta dicen que el
 * paciente es nuevo, y su email ya pertenece a otro paciente del usuario.
 *
 * Un email identifica a una persona, así que el choque no es un caso de borde
 * técnico: significa que alguien se equivocó, y hay tres formas de hacerlo. Lo
 * que viaja al cliente es la comparación para que **él** decida cuál fue; el
 * sistema no empareja por su cuenta.
 *
 * La dieta no forma parte de nada de esto a propósito. El conflicto identifica
 * a una persona; el documento vive en la pantalla hasta que se resuelve.
 */

/** Las tres formas de equivocarse que un choque de email puede significar. */
export const IDENTITY_RESOLUTIONS = [
  /** Es el mismo paciente: el usuario pulsó "nuevo" por error. */
  "mismo-paciente",
  /** El email se dictó mal y no es el de este paciente nuevo. */
  "email-mal-dictado",
  /** La ficha que ocupa ese email tiene los datos equivocados. */
  "datos-guardados-mal",
] as const;

export type IdentityResolution = (typeof IDENTITY_RESOLUTIONS)[number];

export function isIdentityResolution(
  value: unknown,
): value is IdentityResolution {
  return (
    typeof value === "string" &&
    (IDENTITY_RESOLUTIONS as readonly string[]).includes(value)
  );
}

/** Campos de identidad que se comparan. No hay más: identifican a la persona. */
export const IDENTITY_FIELDS = [
  "nameSurnames",
  "age",
  "mail",
  "phone",
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

/**
 * Qué pasa con un campo al comparar las dos identidades.
 *
 * `falta` no es `difiere`: que el audio no mencione el teléfono no es una
 * discrepancia con la ficha, y presentarlo como tal empujaría al usuario a
 * "corregir" un dato bueno con un hueco.
 */
export type IdentityFieldStatus = "coincide" | "difiere" | "falta";

export type IdentityFieldComparison = {
  field: IdentityField;
  /** Lo que hay en la ficha que ya ocupa ese email. */
  existing: string | null;
  /** Lo que se extrajo del audio de esta consulta. */
  extracted: string | null;
  status: IdentityFieldStatus;
};

/**
 * Lo que la pantalla necesita para que el usuario distinga los tres errores.
 *
 * Lleva el identificador del paciente existente para poder abrirlo, y nada del
 * contenido clínico de la consulta.
 */
export type PatientIdentityConflict = {
  /** El paciente que ya ocupa ese email. */
  existingPatientId: string;
  /** El email en disputa, ya normalizado: el que ambos comparten. */
  mail: string;
  fields: IdentityFieldComparison[];
};
