import { describe, expect, it } from "vitest";

import {
  buildIdentityConflict,
  normalizeMail,
  type ExistingPatientIdentity,
} from "@/services/patient-identity-service";
import type { PatientData } from "@/models/extraction/extraction.models";

const EXISTING: ExistingPatientIdentity = {
  id: "p-existente",
  name_surnames: "Jesús Arsenio García García",
  mail: "deportesperales@gmail.com",
  age: 36,
  phone: "657423574",
};

function extracted(overrides: Partial<PatientData> = {}): PatientData {
  return {
    name_surnames: "Jesús Arsenio García García",
    mail: "deportesperales@gmail.com",
    age: 36,
    phone: "657423574",
    ...overrides,
  };
}

const statusOf = (
  conflict: ReturnType<typeof buildIdentityConflict>,
  field: string,
) => conflict.fields.find((entry) => entry.field === field)!.status;

describe("normalizeMail", () => {
  it("compara en minúsculas y sin espacios alrededor", () => {
    expect(normalizeMail("  Deportesperales@Gmail.com ")).toBe(
      "deportesperales@gmail.com",
    );
  });

  it("un email vacío no es un email", () => {
    expect(normalizeMail("   ")).toBeNull();
    expect(normalizeMail(null)).toBeNull();
    expect(normalizeMail(undefined)).toBeNull();
  });
});

describe("buildIdentityConflict", () => {
  it("identifica al paciente que ocupa el email y no lleva la dieta", () => {
    const conflict = buildIdentityConflict(EXISTING, extracted());

    expect(conflict.existingPatientId).toBe("p-existente");
    expect(conflict.mail).toBe("deportesperales@gmail.com");
    expect(Object.keys(conflict)).toEqual([
      "existingPatientId",
      "mail",
      "fields",
    ]);
  });

  it("marca coincide cuando los dos lados dicen lo mismo", () => {
    const conflict = buildIdentityConflict(EXISTING, extracted());

    for (const field of ["nameSurnames", "age", "mail", "phone"]) {
      expect(statusOf(conflict, field)).toBe("coincide");
    }
  });

  it("ignora acentos, mayúsculas y espacios de más al comparar el nombre", () => {
    const conflict = buildIdentityConflict(
      EXISTING,
      extracted({ name_surnames: "  jesus  arsenio GARCIA garcia " }),
    );

    expect(statusOf(conflict, "nameSurnames")).toBe("coincide");
  });

  it("marca difiere cuando los dos lados dicen cosas distintas", () => {
    const conflict = buildIdentityConflict(EXISTING, extracted({ age: 41 }));

    const edad = conflict.fields.find((entry) => entry.field === "age")!;
    expect(edad.status).toBe("difiere");
    expect(edad.existing).toBe("36");
    expect(edad.extracted).toBe("41");
  });

  /**
   * La distinción que más importa. Un hueco no es una discrepancia: si el audio
   * no menciona el teléfono, presentarlo como diferencia empuja a "corregir" un
   * dato bueno con nada.
   */
  it("falta en el audio no es lo mismo que difiere", () => {
    const conflict = buildIdentityConflict(
      EXISTING,
      extracted({ phone: undefined }),
    );

    const telefono = conflict.fields.find((entry) => entry.field === "phone")!;
    expect(telefono.status).toBe("falta");
    expect(telefono.existing).toBe("657423574");
    expect(telefono.extracted).toBeNull();
  });

  it("falta en la ficha guardada tampoco es difiere", () => {
    const conflict = buildIdentityConflict(
      { ...EXISTING, phone: null },
      extracted(),
    );

    const telefono = conflict.fields.find((entry) => entry.field === "phone")!;
    expect(telefono.status).toBe("falta");
    expect(telefono.existing).toBeNull();
    expect(telefono.extracted).toBe("657423574");
  });

  it("una cadena vacía cuenta como ausente, no como valor", () => {
    const conflict = buildIdentityConflict(
      { ...EXISTING, name_surnames: "   " },
      extracted(),
    );

    expect(statusOf(conflict, "nameSurnames")).toBe("falta");
  });
});
