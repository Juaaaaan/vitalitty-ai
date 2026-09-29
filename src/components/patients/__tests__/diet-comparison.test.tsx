import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DietComparison } from "../diet-comparison";
import {
  COMPARISON_FAILED_MESSAGE,
  ONLY_ONE_DIET_MESSAGE,
} from "@/constants/diet-comparison";

const V1 = {
  id: "c1",
  created_at: "2026-01-01T10:00:00Z",
  diet_version: 1,
  diet_md: "# v1",
  objetivo_calorias: 2100,
  weight: 82,
};
const V2 = {
  id: "c2",
  created_at: "2026-02-01T10:00:00Z",
  diet_version: 2,
  diet_md: "# v2",
  objetivo_calorias: 1900,
  weight: "80.5",
};
const NO_DIET = { id: "c9", created_at: "2026-01-15T10:00:00Z" };

const COMPARISON = {
  previous: { consultationId: "c1", dietVersion: 1 },
  current: { consultationId: "c2", dietVersion: 2 },
  portions: [
    {
      group: "hidrato_cena",
      label: "Hidrato en cena",
      previous: {
        group: "hidrato_cena",
        label: "Hidrato en cena",
        min: 30,
        max: 30,
        unit: "g",
        alternatives: "",
      },
      current: {
        group: "hidrato_cena",
        label: "Hidrato en cena",
        min: 20,
        max: 20,
        unit: "g",
        alternatives: "",
      },
      delta: { min: -10, max: -10 },
    },
  ],
  added: ["avena"],
  removed: ["pan blanco"],
  summary: "Se baja el hidrato de la cena porque no pierde peso.",
};

function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => vi.unstubAllGlobals());

describe("DietComparison", () => {
  it("con una sola dieta lo dice y no pide nada", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DietComparison consultations={[V1, NO_DIET]} />);

    expect(screen.getByText(ONLY_ONE_DIET_MESSAGE)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("muestra kcal y peso al momento y el resto al llegar la comparación", async () => {
    let resolve: (value: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);

    render(<DietComparison consultations={[V2, NO_DIET, V1]} />);

    // Compara la última (v2) con la anterior con dieta (v1), no con la consulta sin dieta.
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({ consultationId: "c2" });
    expect(screen.getByText("−200 kcal")).toBeDefined();
    expect(screen.getByText("−1,5 kg")).toBeDefined();
    expect(screen.getByRole("status").textContent).toMatch(/Preparando/);

    resolve(await respond(200, COMPARISON));

    expect(await screen.findByText(COMPARISON.summary)).toBeDefined();
    expect(screen.getByText("−10 g")).toBeDefined();
    expect(screen.getByText("avena")).toBeDefined();
    expect(screen.getByText("pan blanco")).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si falla: mensaje con qué hacer, kcal y peso visibles, y reintentar funciona", async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(respond(500, { error: COMPARISON_FAILED_MESSAGE }))
      .mockReturnValueOnce(respond(200, COMPARISON));
    vi.stubGlobal("fetch", fetchMock);

    render(<DietComparison consultations={[V1, V2]} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(COMPARISON_FAILED_MESSAGE);
    expect(screen.getByText("−200 kcal")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));

    expect(await screen.findByText(COMPARISON.summary)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("con la primera versión muestra el mensaje del servidor (409)", async () => {
    const message =
      "Esta es la primera dieta del paciente: no hay versión anterior con la que compararla.";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => respond(409, { error: message })),
    );

    render(<DietComparison consultations={[V1, V2]} />);

    expect((await screen.findByRole("alert")).textContent).toContain(message);
  });
});
