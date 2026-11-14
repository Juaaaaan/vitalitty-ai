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

const VERSION_1: BrainVersionWithContent = {
  id: "pv1",
  version: 1,
  contenido: "Prompt activo",
  notaCambio: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  activa: true,
};

const VERSIONS: { versiones: BrainVersionWithContent[] } = {
  versiones: [VERSION_1],
};

const DOCUMENTOS = {
  documentos: [
    {
      id: "d1",
      slug: "recetario-maestro",
      titulo: "Recetario maestro",
      tipo: "recetario" as const,
      tags: ["platos"],
      siempreIncluir: false,
      versionActiva: {
        id: "dv1",
        version: 2,
        activadaEn: "2026-10-01T09:00:00.000Z",
        tamano: 1234,
      },
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
      return jsonResponse({ documentos: DOCUMENTOS.documentos });
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

    // La subida vive en un diálogo: en la pestaña solo está su botón, y la
    // zona de arrastre aparece al abrirlo.
    const abrir = await screen.findByRole("button", {
      name: /Subir documento/,
    });
    fireEvent.click(abrir);

    expect(
      await screen.findByText(/Arrastra aquí el documento en Markdown/),
    ).toBeDefined();
  });

  it("marca la versión activa del prompt en el listado", async () => {
    render(<BrainConsole />);

    expect(await screen.findByText("v1")).toBeDefined();
    expect(await screen.findByText(/Activa: v1/)).toBeDefined();
  });

  /**
   * El editor se siembra de la versión activa al montarse, a propósito: así no
   * hace falta un efecto que sincronice el borrador. El precio es que montarlo
   * antes de que el histórico llegue lo deja vacío para siempre, porque su
   * `key` no cambia cuando llegan las versiones. Pasó en el navegador: el
   * prompt tenía 5.846 caracteres en la base y el textarea estaba en blanco.
   *
   * Los tests del editor no lo veían porque le pasan las versiones ya cargadas.
   * Este monta la consola entera y espera por el contenido.
   */
  it("el editor arranca con el contenido de la versión activa, no vacío", async () => {
    render(<BrainConsole />);

    const editor = (await screen.findByLabelText(
      "Contenido",
    )) as HTMLTextAreaElement;

    await waitFor(() => expect(editor.value).toBe("Prompt activo"));
  });

  /**
   * El otro lado del mismo problema. Al activar una versión, el listado y el
   * histórico se recargan por separado, y el listado llega antes. Si el editor
   * se remonta con lo que dice el listado, lo hace mientras el histórico sigue
   * marcando activa la versión anterior: el subtítulo anunciaba el tamaño nuevo
   * y el textarea mostraba el contenido viejo. Guardar encima habría creado una
   * versión con el contenido de la anterior.
   */
  it("tras activar, el editor muestra el contenido de la versión recién activada", async () => {
    const v2: BrainVersionWithContent = {
      id: "pv2",
      version: 2,
      contenido: "Prompt nuevo, ya activo",
      notaCambio: "Segunda versión",
      createdAt: "2026-10-02T09:00:00.000Z",
      activa: false,
    };

    // El listado contesta con la versión activa nueva de inmediato; el
    // histórico, un turno más tarde. Ese desfase es el que rompía el editor.
    let historicoActualizado = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/activar")) {
        historicoActualizado = true;
        return jsonResponse({ ok: true });
      }
      if (url.startsWith("/api/prompts/") && init?.method === undefined) {
        if (historicoActualizado) {
          // El desfase es el bug: `activate` recarga listado e histórico con un
          // `Promise.all`, y sus `setState` caen en microtasks distintas, así
          // que React puede confirmar el listado antes. Sin este retraso las
          // dos respuestas entran en el mismo lote y el fallo no se reproduce.
          await new Promise((resolve) => setTimeout(resolve, 20));
          return jsonResponse({
            versiones: [
              { ...v2, activa: true },
              { ...VERSION_1, activa: false },
            ],
          });
        }
        return jsonResponse({ versiones: [v2, VERSION_1] });
      }
      if (url === "/api/prompts") {
        return jsonResponse({
          prompts: [
            {
              ...PROMPTS.prompts[0],
              versionActiva: historicoActualizado
                ? {
                    id: "pv2",
                    version: 2,
                    activadaEn: "2026-10-02T09:00:00.000Z",
                  }
                : PROMPTS.prompts[0].versionActiva,
            },
          ],
        });
      }
      if (url.startsWith("/api/documentos"))
        return jsonResponse({ documentos: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BrainConsole />);

    const editor = (await screen.findByLabelText(
      "Contenido",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe("Prompt activo"));

    fireEvent.click(await screen.findByRole("button", { name: "Activar" }));

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Contenido") as HTMLTextAreaElement).value,
      ).toBe("Prompt nuevo, ya activo"),
    );
  });
});

describe("Borrar un documento", () => {
  /**
   * Borrar no tiene vuelta atrás —no hay papelera y el histórico se va con el
   * documento—, así que el botón no puede borrar: tiene que preguntar. Este
   * test fija justo eso, que pulsar la papelera no manda ningún DELETE.
   */
  it("la papelera pide confirmación antes de borrar nada", async () => {
    render(<BrainConsole />);

    fireEvent.click(screen.getByRole("tab", { name: "Documentación" }));

    fireEvent.click(
      await screen.findByRole("button", { name: /Borrar Recetario maestro/ }),
    );

    expect(await screen.findByText(/no se puede deshacer/i)).toBeDefined();

    const llamadas = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      llamadas.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("al confirmar, manda el DELETE de ese documento", async () => {
    render(<BrainConsole />);

    fireEvent.click(screen.getByRole("tab", { name: "Documentación" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Borrar Recetario maestro/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Borrar definitivamente" }),
    );

    await waitFor(() => {
      const llamadas = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(
        llamadas.some(
          ([url, init]) =>
            String(url) === "/api/documentos/d1" &&
            (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true);
    });
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
