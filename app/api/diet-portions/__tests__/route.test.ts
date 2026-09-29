import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { projectPortions, createClient, supabase } = vi.hoisted(() => {
  const supabase = { auth: { getUser: vi.fn() }, from: vi.fn() };
  return {
    projectPortions: vi.fn(),
    createClient: vi.fn(async () => supabase),
    supabase,
  };
});

vi.mock("@/services/diet-comparison-service", async (importActual) => ({
  ...(await importActual<object>()),
  projectPortions,
}));
vi.mock("../../../../lib/supabase/server", () => ({ createClient }));
// El servicio real se importa en parte: su cliente no debe crearse en jsdom.
vi.mock("../../../../lib/ai/anthropic", () => ({ default: {} }));

import { POST } from "../route";
import {
  DIET_PORTIONS_VERSION,
  PATIENT_NOT_FOUND_FOR_PORTIONS_MESSAGE,
  PORTIONS_CONCURRENCY,
} from "@/constants/diet-comparison";

const portions = (min: number) => ({
  version: DIET_PORTIONS_VERSION,
  groups: [
    { group: "pan", label: "Pan", min, max: min, unit: "g", alternatives: "" },
  ],
});

const row = (version: number, dietPortions: unknown = null) => ({
  id: `c${version}`,
  diet_version: version,
  created_at: `2026-0${version}-01T10:00:00Z`,
  diet_md: `# v${version}`,
  diet_portions: dietPortions,
});

/** `patients` responde a maybeSingle; `patient_consultations` a la lista. */
function stubDb({
  patient = { id: "p1" } as unknown,
  diets = [] as unknown[],
} = {}) {
  const updates: Array<{ row: Record<string, unknown>; id: unknown }> = [];
  supabase.from.mockImplementation((table: string) => {
    let pendingUpdate: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        if (pendingUpdate && column === "id") {
          updates.push({ row: pendingUpdate, id: value });
          return Promise.resolve({ error: null });
        }
        return chain;
      },
      not: () => chain,
      order: async () => ({ data: diets, error: null }),
      update: (value: Record<string, unknown>) => {
        pendingUpdate = value;
        return chain;
      },
      maybeSingle: async () => ({
        data: table === "patients" ? patient : null,
        error: null,
      }),
    };
    return chain;
  });
  return updates;
}

function requestWith(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/diet-portions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    projectPortions.mockImplementation(async (md: string) =>
      portions(Number(md.replace("# v", "")) * 10),
    );
  });

  it("proyecta solo las dietas sin raciones o con formato antiguo y guarda cada una", async () => {
    const updates = stubDb({
      diets: [
        row(1, portions(99)),
        row(2),
        row(3, { version: DIET_PORTIONS_VERSION - 1, groups: [] }),
      ],
    });

    const response = await POST(requestWith({ patientId: "p1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(projectPortions.mock.calls.map(([md]) => md).sort()).toEqual([
      "# v2",
      "# v3",
    ]);
    expect(updates.map((u) => u.id).sort()).toEqual(["c2", "c3"]);
    expect(body.failed).toEqual([]);
    expect(
      body.portions.map((p: { dietVersion: number }) => p.dietVersion),
    ).toEqual([1, 2, 3]);
    expect(body.portions[0].portions).toEqual(portions(99));
    expect(JSON.stringify(body)).not.toContain("# v");
  });

  it("fallo parcial: devuelve las que hay y los ids fallidos", async () => {
    projectPortions.mockImplementation(async (md: string) => {
      if (md === "# v2") throw new Error("haiku cayó");
      return portions(10);
    });
    const updates = stubDb({ diets: [row(1), row(2)] });

    const body = await (await POST(requestWith({ patientId: "p1" }))).json();

    expect(body.failed).toEqual(["c2"]);
    expect(
      body.portions.map((p: { consultationId: string }) => p.consultationId),
    ).toEqual(["c1"]);
    expect(updates.map((u) => u.id)).toEqual(["c1"]);
  });

  it(`no lanza más de ${PORTIONS_CONCURRENCY} proyecciones a la vez`, async () => {
    let inFlight = 0;
    let peak = 0;
    projectPortions.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return portions(10);
    });
    stubDb({ diets: Array.from({ length: 9 }, (_, i) => row(i + 1)) });

    await POST(requestWith({ patientId: "p1" }));

    expect(projectPortions).toHaveBeenCalledTimes(9);
    expect(peak).toBe(PORTIONS_CONCURRENCY);
  });

  it("400 sin patientId", async () => {
    const response = await POST(requestWith({}));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
  });

  it("404 con un paciente ajeno y ningún modelo", async () => {
    stubDb({ patient: null, diets: [row(1)] });

    const response = await POST(requestWith({ patientId: "otro" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: PATIENT_NOT_FOUND_FOR_PORTIONS_MESSAGE,
    });
    expect(projectPortions).not.toHaveBeenCalled();
  });
});
