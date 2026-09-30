import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DietApproval } from "@/components/diets/diet-approval";

const STRUCTURED_HTML =
  "<!doctype html><html><body><section class='cover'>@vitalittynutri</section></body></html>";
const RAW_HTML =
  "<!doctype html><html><body><pre class='raw'>x</pre></body></html>";

function mockFetch(
  handlers: Record<string, { status?: number; body: unknown }>,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    const match = handlers[url];
    if (!match) throw new Error(`sin handler para ${url}`);

    return {
      ok: (match.status ?? 200) < 400,
      status: match.status ?? 200,
      json: async () => match.body,
    } as Response;
  });
}

describe("DietApproval", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra la vista previa maquetada sin generar PDF", async () => {
    const fetchMock = mockFetch({
      "/api/diet-preview": {
        body: { html: STRUCTURED_HTML, structured: true },
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DietApproval
        consultationId="c1"
        dietMd="# Dieta"
        onDietMdChange={vi.fn()}
      />,
    );

    const frame = await screen.findByTitle("Vista previa de la dieta");

    expect(frame.getAttribute("srcdoc")).toBe(STRUCTURED_HTML);
    // Ni un solo PDF hasta que el usuario apruebe.
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/diet-pdf",
      expect.anything(),
    );
  });

  it("aprueba y ofrece la descarga del PDF", async () => {
    const fetchMock = mockFetch({
      "/api/diet-preview": {
        body: { html: STRUCTURED_HTML, structured: true },
      },
      "/api/diet-pdf": {
        body: { url: "https://storage/signed/c1.pdf?token=t" },
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DietApproval
        consultationId="c1"
        dietMd="# Dieta"
        onDietMdChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText("Aprobar y generar PDF"));

    const link = await screen.findByText("Descargar PDF");

    expect(link.closest("a")?.getAttribute("href")).toBe(
      "https://storage/signed/c1.pdf?token=t",
    );
  });

  it("guarda una corrección, refresca la vista previa y no descarga nada", async () => {
    const fetchMock = mockFetch({
      "/api/diet-preview": {
        body: { html: STRUCTURED_HTML, structured: true },
      },
      "/api/diet-document": { body: { success: true } },
    });
    vi.stubGlobal("fetch", fetchMock);
    const onDietMdChange = vi.fn();

    render(
      <DietApproval
        consultationId="c1"
        dietMd="# Dieta"
        onDietMdChange={onDietMdChange}
      />,
    );

    fireEvent.click(await screen.findByText("Modificar"));
    fireEvent.change(screen.getByLabelText("Documento de la dieta"), {
      target: { value: "# Dieta corregida" },
    });
    fireEvent.click(screen.getByText("Guardar cambios"));

    await waitFor(() =>
      expect(onDietMdChange).toHaveBeenCalledWith("# Dieta corregida"),
    );

    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/diet-document",
    )!;
    const options = call[1]!;
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({
      consultationId: "c1",
      dietMd: "# Dieta corregida",
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/diet-pdf",
      expect.anything(),
    );
  });

  it("no deja aprobar una dieta anterior al contrato y lo explica", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/diet-preview": { body: { html: RAW_HTML, structured: false } },
      }),
    );

    render(
      <DietApproval
        consultationId="c1"
        dietMd="# Dieta antigua"
        onDietMdChange={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/anterior al formato con plantilla/),
    ).toBeTruthy();
    expect(
      screen.getByText("Aprobar y generar PDF").closest("button")?.disabled,
    ).toBe(true);
  });

  it("muestra en español el error del servidor", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/diet-preview": {
          body: { html: STRUCTURED_HTML, structured: true },
        },
        "/api/diet-pdf": {
          status: 500,
          body: { error: "No se pudo generar el PDF. Inténtalo de nuevo." },
        },
      }),
    );

    render(
      <DietApproval
        consultationId="c1"
        dietMd="# Dieta"
        onDietMdChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText("Aprobar y generar PDF"));

    expect(
      await screen.findByText("No se pudo generar el PDF. Inténtalo de nuevo."),
    ).toBeTruthy();
  });
});
