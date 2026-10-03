import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { BrainConsole } from "@/components/cerebro/brain-console";
import { DocumentUpload } from "@/components/cerebro/document-upload";
import { VersionedEditor } from "@/components/cerebro/versioned-editor";
import { diffLines } from "@/components/cerebro/version-diff";
import type { BrainVersionWithContent } from "@/models/brain/brain.models";

const PROMPTS = {
  prompts: [
    {
      id: "p1",
      slug: "generacion-dieta",
      nombre: "Generación de dieta",
      tipo: "generacion_dieta",
      versionActiva: {
        id: "pv1",
        version: 1,
        activadaEn: "2026-10-01T09:00:00.000Z",
      },
    },
  ],
};

const VERSIONS: { versiones: BrainVersionWithContent[] } = {
  versiones: [
    {
      id: "pv1",
      version: 1,
      contenido: "Prompt activo",
      notaCambio: null,
      createdAt: "2026-10-01T09:00:00.000Z",
      activa: true,
    },
  ],
};

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/prompts/")) return jsonResponse(VERSIONS);
    if (url === "/api/prompts") return jsonResponse(PROMPTS);
    if (url.startsWith("/api/documentos"))
      return jsonResponse({ documentos: [] });
    throw new Error(`Unexpected fetch: ${url}`);
  });
});

describe("BrainConsole", () => {
  it("abre en Prompts y cambia a Documentación", async () => {
    render(<BrainConsole />);

    // Aparece dos veces: en el listado y como título del editor.
    expect(
      (await screen.findAllByText("Generación de dieta")).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "Documentación" }));

    expect(
      await screen.findByText(/Arrastra aquí el documento en Markdown/),
    ).toBeDefined();
  });

  it("marca la versión activa del prompt en el listado", async () => {
    render(<BrainConsole />);

    expect(await screen.findByText("v1")).toBeDefined();
    expect(await screen.findByText(/Versión activa: v1/)).toBeDefined();
  });
});

describe("DocumentUpload", () => {
  it("rechaza un .pdf antes de subir nada, con el mensaje de Markdown", async () => {
    const onUploaded = vi.fn();
    render(<DocumentUpload onUploaded={onUploaded} />);

    const input = screen.getByLabelText("Adjuntar documento Markdown");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["%PDF-1.7"], "compendio.pdf", { type: "application/pdf" }),
        ],
      },
    });

    expect(
      await screen.findByText("Sube el documento en formato Markdown (.md)."),
    ).toBeDefined();
    // Ni se ha subido ni se ha llamado al servidor.
    expect(onUploaded).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("acepta un .md y rellena el título con el nombre del fichero", async () => {
    render(<DocumentUpload onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Adjuntar documento Markdown"), {
      target: {
        files: [
          new File(["# Recetario\n\nArroz"], "recetario_maestro.md", {
            type: "text/markdown",
          }),
        ],
      },
    });

    await waitFor(() =>
      expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe(
        "recetario maestro",
      ),
    );
    expect(screen.queryByText(/formato Markdown \(\.md\)\./)).toBeNull();
  });
});

describe("VersionedEditor", () => {
  const versions: BrainVersionWithContent[] = [
    {
      id: "v2",
      version: 2,
      contenido: "Texto nuevo",
      notaCambio: "Afino proteína",
      createdAt: "2026-10-02T09:00:00.000Z",
      activa: false,
    },
    {
      id: "v1",
      version: 1,
      contenido: "Texto viejo",
      notaCambio: null,
      createdAt: "2026-10-01T09:00:00.000Z",
      activa: true,
    },
  ];

  it("guardar y activar son acciones separadas", async () => {
    const onSave = vi.fn(async () => null);
    const onActivate = vi.fn(async () => null);

    render(
      <VersionedEditor
        titulo="Generación de dieta"
        versiones={versions}
        onSave={onSave}
        onActivate={onActivate}
      />,
    );

    fireEvent.change(screen.getByLabelText("Contenido"), {
      target: { value: "Texto retocado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("Texto retocado", ""),
    );
    // Guardar no activa: eso lo hace su propio botón.
    expect(onActivate).not.toHaveBeenCalled();
    expect(await screen.findByText(/No está activa todavía/)).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Activar la última versión" }),
    );
    await waitFor(() => expect(onActivate).toHaveBeenCalledWith("v2"));
  });

  it("restaurar carga el contenido antiguo sin guardar ni activar", async () => {
    const onSave = vi.fn(async () => null);
    const onActivate = vi.fn(async () => null);

    render(
      <VersionedEditor
        titulo="Generación de dieta"
        versiones={versions}
        onSave={onSave}
        onActivate={onActivate}
      />,
    );

    const [restoreNewest] = screen.getAllByRole("button", {
      name: /Restaurar/,
    });
    fireEvent.click(restoreNewest);

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Contenido") as HTMLTextAreaElement).value,
      ).toBe("Texto nuevo"),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Guarda para crear una versión nueva/),
    ).toBeDefined();
  });

  it("muestra el diff de una versión contra la anterior", async () => {
    render(
      <VersionedEditor
        titulo="Generación de dieta"
        versiones={versions}
        onSave={async () => null}
        onActivate={async () => null}
      />,
    );

    const [seeChanges] = screen.getAllByRole("button", {
      name: "Ver cambios",
    });
    fireEvent.click(seeChanges);

    expect(await screen.findByText(/Texto nuevo/)).toBeDefined();
  });
});

describe("diffLines", () => {
  it("marca lo añadido y lo quitado", () => {
    expect(diffLines("uno\ndos", "uno\ntres")).toEqual([
      { kind: "same", text: "uno" },
      { kind: "removed", text: "dos" },
      { kind: "added", text: "tres" },
    ]);
  });

  it("sin cambios no marca nada", () => {
    expect(diffLines("igual", "igual")).toEqual([
      { kind: "same", text: "igual" },
    ]);
  });
});
