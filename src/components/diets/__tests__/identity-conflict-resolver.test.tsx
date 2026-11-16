import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { IdentityConflictResolver } from "@/components/diets/identity-conflict-resolver";
import type { PatientIdentityConflict } from "@/models/patient-identity/identity-conflict.models";

const TODO_COINCIDE: PatientIdentityConflict = {
  existingPatientId: "p-existente",
  mail: "deportesperales@gmail.com",
  fields: [
    {
      field: "nameSurnames",
      existing: "Jesús Arsenio García García",
      extracted: "Jesús Arsenio García García",
      status: "coincide",
    },
    { field: "age", existing: "36", extracted: "36", status: "coincide" },
    {
      field: "mail",
      existing: "deportesperales@gmail.com",
      extracted: "deportesperales@gmail.com",
      status: "coincide",
    },
    {
      field: "phone",
      existing: "657423574",
      extracted: null,
      status: "falta",
    },
  ],
};

function renderResolver(
  overrides: Partial<Parameters<typeof IdentityConflictResolver>[0]> = {},
) {
  const onResolved = vi.fn();
  render(
    <IdentityConflictResolver
      conflict={TODO_COINCIDE}
      dietMd="---\npaciente: Jesús\n---"
      transcription="consulta dictada"
      extraction={{ patient: { name_surnames: "Jesús" }, consultation: {} }}
      onResolved={onResolved}
      {...overrides}
    />,
  );
  return { onResolved };
}

function respuesta(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("IdentityConflictResolver", () => {
  it("avisa de que la dieta no está guardada", () => {
    renderResolver();

    expect(screen.getByText(/todavía no está guardada/i)).toBeDefined();
  });

  it("enseña las dos identidades campo a campo", () => {
    renderResolver();

    expect(screen.getByText("Ficha guardada")).toBeDefined();
    expect(screen.getByText("Dictado hoy")).toBeDefined();
    // Un hueco se marca como tal, no como discrepancia.
    expect(screen.getByText("sin dato")).toBeDefined();
    expect(screen.queryByText("no coincide")).toBeNull();
  });

  /**
   * Lo que el change decidió: el sistema no empareja por su cuenta ni cuando
   * todo cuadra. Con los cuatro campos coincidentes sigue habiendo tres
   * botones y nada se ha guardado.
   */
  it("con todo coincidente sigue pidiendo elegir y no guarda nada", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { onResolved } = renderResolver();

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("cada salida manda su propio valor a la ruta de resolución", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        respuesta({ consultationId: "c1", patientId: "p1", dietVersion: 3 }),
      );
    const { onResolved } = renderResolver();

    fireEvent.click(screen.getByRole("button", { name: /mismo paciente/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalled());

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("/api/resolve-identity-conflict");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.resolution).toBe("mismo-paciente");
    expect(body.existingPatientId).toBe("p-existente");
    expect(body.dietMd).toContain("paciente: Jesús");
    expect(onResolved).toHaveBeenCalledWith({
      consultationId: "c1",
      patientId: "p1",
      dietVersion: 3,
    });
  });

  /**
   * Un fallo al guardar no puede costar la dieta: sigue en pantalla y el
   * usuario puede volver a intentarlo sin regenerar nada.
   */
  it("si la resolución falla, enseña el motivo y deja reintentar", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        respuesta({ error: "No se ha podido guardar la consulta." }, false),
      )
      .mockResolvedValueOnce(
        respuesta({ consultationId: "c2", patientId: "p1", dietVersion: 1 }),
      );
    const { onResolved } = renderResolver();

    fireEvent.click(screen.getByRole("button", { name: /mismo paciente/i }));

    expect(
      await screen.findByText(/No se ha podido guardar la consulta/i),
    ).toBeDefined();
    expect(onResolved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /mismo paciente/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
