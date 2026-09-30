import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PatientPicker } from "../patient-picker";
import type { Patient } from "@/models/dashboard/patients";

const HOMONYMS = [
  {
    id: "p1",
    name_surnames: "Ana García",
    mail: "ana1@example.com",
    phone: "600000001",
  },
  {
    id: "p2",
    name_surnames: "Ana García",
    mail: "ana2@example.com",
    phone: "600000002",
  },
] as Patient[];

beforeAll(() => {
  // cmdk y Radix esperan APIs de layout que jsdom no trae.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= vi.fn();
});

describe("PatientPicker", () => {
  it("muestra dos homónimos como dos opciones distinguibles", () => {
    render(
      <PatientPicker
        patients={HOMONYMS}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));

    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText(/ana1@example.com/)).toBeDefined();
    expect(screen.getByText(/ana2@example.com/)).toBeDefined();
  });

  it("devuelve el id del homónimo elegido", () => {
    const onSelect = vi.fn();
    render(
      <PatientPicker
        patients={HOMONYMS}
        selectedId={null}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(/ana2@example.com/));

    expect(onSelect).toHaveBeenCalledWith("p2");
  });

  it("enseña el paciente elegido con su contacto", () => {
    render(
      <PatientPicker patients={HOMONYMS} selectedId="p1" onSelect={vi.fn()} />,
    );

    expect(screen.getByRole("combobox").textContent).toContain(
      "Ana García — ana1@example.com",
    );
  });
});
