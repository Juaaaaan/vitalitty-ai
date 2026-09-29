import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { createClient, supabase, chain } = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const supabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => chain),
  };
  return { createClient: vi.fn(async () => supabase), supabase, chain };
});

vi.mock("../../../../lib/supabase/server", () => ({ createClient }));

import { POST } from "../route";
import { LEGACY_DIET_WITHOUT_FRONTMATTER } from "@/services/__tests__/fixtures/legacy-diet";

function requestWith(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const STRUCTURED = `---
paciente: Sandra de Gregorio
version: 5
proxima_revision: 8 de enero de 2026 / 13:00
calorias: 1400-1500 KCAL
---

## Objetivos

- Reducir el porcentaje graso.
`;

describe("POST /api/diet-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.maybeSingle.mockResolvedValue({
      data: { id: "c1", diet_md: STRUCTURED },
      error: null,
    });
  });

  it("devuelve el documento maquetado con la marca", async () => {
    const response = await POST(requestWith({ consultationId: "c1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.structured).toBe(true);
    expect(body.html).toContain("@vitalittynutri");
    expect(body.html).toContain("Sandra de Gregorio");
    expect(body.html).toContain("Reducir el porcentaje graso");
  });

  it("marca como no estructurada una dieta anterior al contrato", async () => {
    chain.maybeSingle.mockResolvedValue({
      data: { id: "c1", diet_md: LEGACY_DIET_WITHOUT_FRONTMATTER },
      error: null,
    });

    const body = await (
      await POST(requestWith({ consultationId: "c1" }))
    ).json();

    expect(body.structured).toBe(false);
    expect(body.html).toContain('class="raw"');
    expect(body.html).not.toContain("cover-logo");
  });

  it("responde 400 en español si falta el identificador", async () => {
    const response = await POST(requestWith({}));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Falta el identificador de la consulta.",
    );
  });

  it("responde 404 en español si la consulta no es del usuario", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(requestWith({ consultationId: "ajena" }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("No se encuentra la consulta.");
  });

  it("responde 401 en español si no hay sesión", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestWith({ consultationId: "c1" }));

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe(
      "Inicia sesión para ver la dieta.",
    );
  });

  it("no arrastra Chromium: la ruta no importa puppeteer ni pdf-lib", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/api/diet-preview/route.ts", "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

    // Se miran los imports, no el texto: los comentarios de la ruta nombran a
    // Chromium precisamente para explicar por qué no está aquí.
    expect(imports).not.toContain("puppeteer-core");
    expect(imports).not.toContain("@sparticuz/chromium");
    expect(imports).not.toContain("pdf-lib");
    expect(imports.some((name) => name.includes("diet-pdf-service"))).toBe(
      false,
    );
  });
});
