import type { PatientData } from "@/models/extraction/extraction.models";
import {
  IDENTITY_FIELDS,
  type IdentityField,
  type IdentityFieldComparison,
  type PatientIdentityConflict,
} from "@/models/patient-identity/identity-conflict.models";

/**
 * Comparar dos identidades que comparten email, para que el usuario vea cuál de
 * los tres errores ocurrió.
 *
 * Aquí no se decide nada: se presenta. La decisión es suya, porque el sistema no
 * puede saber si se equivocó de botón, dictó mal el correo o tiene la ficha mal
 * guardada — y las tres se arreglan distinto.
 */

/** La ficha que ya ocupa el email, tal y como está guardada. */
export type ExistingPatientIdentity = {
  id: string;
  name_surnames: string | null;
  mail: string | null;
  age: number | null;
  phone: string | null;
};

/**
 * Email comparable: minúsculas y sin espacios alrededor.
 *
 * Es la misma forma con la que se busca al dueño, así que un correo dictado con
 * otra capitalización choca igual. Lo contrario dejaría crear duplicados que la
 * restricción única de la base sí rechazaría después.
 */
export function normalizeMail(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** El valor de un campo de identidad, como texto comparable, o `null` si no hay. */
function valueOf(
  field: IdentityField,
  identity: {
    nameSurnames?: string | null;
    mail?: string | null;
    age?: number | null;
    phone?: string | null;
  },
): string | null {
  const raw =
    field === "nameSurnames"
      ? identity.nameSurnames
      : field === "mail"
        ? identity.mail
        : field === "age"
          ? identity.age
          : identity.phone;

  if (raw == null) return null;
  const text = String(raw).trim();
  return text.length > 0 ? text : null;
}

/** Dos valores iguales a ojos de una persona: sin acentos, espacios ni mayúsculas. */
function sameValue(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  return normalize(left) === normalize(right);
}

function compareField(
  field: IdentityField,
  existing: string | null,
  extracted: string | null,
): IdentityFieldComparison {
  // Que uno de los dos no tenga el dato no es una discrepancia: es un hueco.
  // Presentarlo como diferencia empujaría a "corregir" un dato bueno con nada.
  const status =
    existing == null || extracted == null
      ? "falta"
      : sameValue(existing, extracted)
        ? "coincide"
        : "difiere";

  return { field, existing, extracted, status };
}

/**
 * La comparación que ve el usuario, campo a campo.
 *
 * `extracted` son los datos que la extracción sacó del audio de esta consulta;
 * `existing`, la ficha que ya ocupa ese email.
 */
export function buildIdentityConflict(
  existing: ExistingPatientIdentity,
  extracted: PatientData,
): PatientIdentityConflict {
  const extractedIdentity = {
    nameSurnames: extracted.name_surnames,
    mail: extracted.mail,
    age: extracted.age,
    phone: extracted.phone,
  };

  const existingIdentity = {
    nameSurnames: existing.name_surnames,
    mail: existing.mail,
    age: existing.age,
    phone: existing.phone,
  };

  return {
    existingPatientId: existing.id,
    mail: normalizeMail(existing.mail) ?? normalizeMail(extracted.mail) ?? "",
    fields: IDENTITY_FIELDS.map((field) =>
      compareField(
        field,
        valueOf(field, existingIdentity),
        valueOf(field, extractedIdentity),
      ),
    ),
  };
}
