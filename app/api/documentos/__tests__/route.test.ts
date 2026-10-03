import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import {
  createFakeSupabase,
  type FakeSupabase,
} from "@/services/__tests__/helpers/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("../../../../lib/supabase/server", () => ({ createClient }));

import { GET as listDocuments, POST as uploadDocument } from "../route";
import {
  GET as listVersions,
  POST as createVersion,
} from "../[id]/versiones/route";
import { POST as activate } from "../[id]/activar/route";
import { PATCH as updateMetadata } from "../[id]/route";

const OWNER = "u1";

const PDF_CONTENT = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>";

function seeded(): FakeSupabase {
  return createFakeSupabase({
    userId: OWNER,
    tables: {
      documentos_conocimiento: [
        {
          id: "d1",
          slug: "recetario-maestro",
          titulo: "Recetario maestro",
          tipo: "recetario",
          tags: ["platos", "gluten"],
          siempre_incluir: false,
          version_activa_id: "dv1",
          version_activada_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "d2",
          slug: "protocolo-editor",
          titulo: "Protocolo del editor",
          tipo: "protocolo",
          tags: ["estilo"],
          siempre_incluir: true,
          version_activa_id: "dv2",
          version_activada_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "d-ajeno",
          slug: "recetario-ajeno",
          titulo: "Recetario de otra",
          tipo: "recetario",
          tags: ["platos"],
          siempre_incluir: true,
          version_activa_id: "dv-ajena",
          version_activada_at: null,
          created_by: "u2",
        },
      ],
      documento_versiones: [
        {
          id: "dv1",
          documento_id: "d1",
          version: 1,
          contenido_md: "# Recetario\n\nArroz con pollo",
          nota_cambio: null,
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "dv2",
          documento_id: "d2",
          version: 1,
          contenido_md: "# Protocolo\n\nTono y estilo",
          nota_cambio: null,
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: OWNER,
        },
        {
          id: "dv-ajena",
          documento_id: "d-ajeno",
          version: 1,
          contenido_md: "RECETAS SECRETAS DE OTRA USUARIA",
          nota_cambio: null,
          created_at: "2026-10-01T09:00:00.000Z",
          created_by: "u2",
        },
      ],
    },
  });
}

function body(payload: unknown): NextRequest {
  return { json: async () => payload } as unknown as NextRequest;
}

function withQuery(query: string): NextRequest {
  return {
    url: `http://localhost/api/documentos${query}`,
  } as unknown as NextRequest;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let supabase: FakeSupabase;

beforeEach(() => {
  vi.clearAllMocks();
  supabase = seeded();
  createClient.mockImplementation(async () => supabase);
});

describe("GET /api/documentos", () => {
  it("lista los documentos propios con su metadata y tamaño activo", async () => {
    const response = await listDocuments(withQuery(""));
    const { documentos } = await response.json();

    expect(response.status).toBe(200);
    expect(documentos).toHaveLength(2);
    const recetario = documentos.find(
      (document: { id: string }) => document.id === "d1",
    );
    expect(recetario).toMatchObject({
      tipo: "recetario",
      tags: ["platos", "gluten"],
      siempreIncluir: false,
    });
    expect(recetario.versionActiva.tamano).toBeGreaterThan(0);
  });

  it("filtra por tipo y por etiqueta a la vez", async () => {
    const byType = await (
      await listDocuments(withQuery("?tipo=protocolo"))
    ).json();
    expect(byType.documentos.map((d: { id: string }) => d.id)).toEqual(["d2"]);

    const combined = await (
      await listDocuments(withQuery("?tipo=recetario&tag=gluten"))
    ).json();
    expect(combined.documentos.map((d: { id: string }) => d.id)).toEqual([
      "d1",
    ]);

    const empty = await (
      await listDocuments(withQuery("?tipo=protocolo&tag=gluten"))
    ).json();
    expect(empty.documentos).toEqual([]);
  });

  it("no incluye documentos de otro usuario, ni los de inclusión incondicional", async () => {
    const { documentos } = await (await listDocuments(withQuery(""))).json();

    expect(documentos.map((d: { id: string }) => d.id)).not.toContain(
      "d-ajeno",
    );
  });

  it("un tipo inventado responde 400", async () => {
    expect((await listDocuments(withQuery("?tipo=inventado"))).status).toBe(
      400,
    );
  });
});

describe("POST /api/documentos", () => {
  it("crea el documento con su versión 1 activa", async () => {
    const response = await uploadDocument(
      body({
        titulo: "Biblioteca de suplementación",
        tipo: "suplementacion",
        tags: ["Creatina", " creatina ", "magnesio"],
        siempreIncluir: true,
        contenidoMd: "# Suplementación\n\nCreatina 3-5 g/día",
        nombreFichero: "biblioteca.md",
      }),
    );
    const { documento } = await response.json();

    expect(response.status).toBe(200);
    expect(documento.version).toBe(1);

    const created = supabase.tables.documentos_conocimiento.find(
      (row) => row.id === documento.id,
    )!;
    expect(created.slug).toBe("biblioteca-de-suplementacion");
    // Etiquetas normalizadas: minúsculas, sin huecos ni repetidas.
    expect(created.tags).toEqual(["creatina", "magnesio"]);
    expect(created.version_activa_id).toBeTruthy();
  });

  it("rechaza un PDF con el mensaje de markdown y sin crear nada", async () => {
    const response = await uploadDocument(
      body({
        titulo: "Compendio",
        tipo: "paper",
        contenidoMd: PDF_CONTENT,
      }),
    );
    const { error } = await response.json();

    expect(response.status).toBe(400);
    expect(error).toBe("Sube el documento en formato Markdown (.md).");
    expect(supabase.tables.documentos_conocimiento).toHaveLength(3);
    expect(supabase.tables.documento_versiones).toHaveLength(3);
  });

  it("rechaza por extensión cuando el cliente manda el nombre del fichero", async () => {
    const response = await uploadDocument(
      body({
        titulo: "Compendio",
        tipo: "paper",
        contenidoMd: "# Texto plausible",
        nombreFichero: "compendio.docx",
      }),
    );
    const { error } = await response.json();

    expect(response.status).toBe(400);
    expect(error).toContain("Markdown");
    expect(supabase.tables.documentos_conocimiento).toHaveLength(3);
  });

  it("rechaza un documento vacío", async () => {
    const response = await uploadDocument(
      body({ titulo: "Vacío", tipo: "otro", contenidoMd: "   " }),
    );
    const { error } = await response.json();

    expect(response.status).toBe(400);
    expect(error).toContain("vacío");
    expect(supabase.tables.documento_versiones).toHaveLength(3);
  });

  it("rechaza un tipo fuera del conjunto cerrado", async () => {
    const response = await uploadDocument(
      body({ titulo: "Algo", tipo: "receta-libre", contenidoMd: "# Algo" }),
    );

    expect(response.status).toBe(400);
  });
});

describe("versiones de un documento", () => {
  it("crear una versión no la activa", async () => {
    const response = await createVersion(
      body({ contenidoMd: "# Recetario\n\nCorregido" }),
      params("d1"),
    );
    const { version } = await response.json();

    expect(version.version).toBe(2);
    expect(version.activa).toBe(false);
    expect(
      supabase.tables.documentos_conocimiento.find((row) => row.id === "d1")!
        .version_activa_id,
    ).toBe("dv1");
  });

  it("aplica la validación de markdown también al corregir", async () => {
    const response = await createVersion(
      body({ contenidoMd: PDF_CONTENT }),
      params("d1"),
    );
    const { error } = await response.json();

    expect(response.status).toBe(400);
    expect(error).toContain("Markdown");
    expect(supabase.tables.documento_versiones).toHaveLength(3);
  });

  it("activar mueve el puntero del documento", async () => {
    await createVersion(body({ contenidoMd: "# Recetario v2" }), params("d1"));
    const created = supabase.tables.documento_versiones.at(-1)!;

    const response = await activate(
      body({ versionId: created.id }),
      params("d1"),
    );

    expect(response.status).toBe(200);
    expect(
      supabase.tables.documentos_conocimiento.find((row) => row.id === "d1")!
        .version_activa_id,
    ).toBe(created.id);
  });

  it("el histórico de un documento ajeno responde 404 sin filtrar contenido", async () => {
    const response = await listVersions(body(null), params("d-ajeno"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(JSON.stringify(payload)).not.toContain("RECETAS SECRETAS");
  });
});

describe("PATCH /api/documentos/[id]", () => {
  it("cambia las etiquetas sin tocar las versiones", async () => {
    const before = supabase.tables.documento_versiones.length;

    const response = await updateMetadata(
      body({ tags: ["Platos", "celiaquia"], siempreIncluir: true }),
      params("d1"),
    );

    expect(response.status).toBe(200);
    const document = supabase.tables.documentos_conocimiento.find(
      (row) => row.id === "d1",
    )!;
    expect(document.tags).toEqual(["celiaquia", "platos"]);
    expect(document.siempre_incluir).toBe(true);
    expect(supabase.tables.documento_versiones).toHaveLength(before);
  });

  it("un documento ajeno responde 404", async () => {
    const response = await updateMetadata(
      body({ siempreIncluir: false }),
      params("d-ajeno"),
    );

    expect(response.status).toBe(404);
    expect(
      supabase.tables.documentos_conocimiento.find(
        (row) => row.id === "d-ajeno",
      )!.siempre_incluir,
    ).toBe(true);
  });

  it("un tipo inválido responde 400", async () => {
    expect(
      (await updateMetadata(body({ tipo: "inventado" }), params("d1"))).status,
    ).toBe(400);
  });
});
