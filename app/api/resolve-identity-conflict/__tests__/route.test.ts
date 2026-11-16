import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("../../../../lib/supabase/server", () => ({ createClient }));

import { POST } from "../route";

type Write = { table: string; op: "insert" | "update"; payload?: unknown };

const DIETA = "---\npaciente: Jesús\n---\n\n## Objetivos\n";

const EXTRACTION = {
  patient: {
    name_surnames: "Jesús Arsenio García García",
    mail: "deportesperales@gmail.com",
    age: 41,
    weight: 94,
    phone: undefined,
  },
  consultation: { objetivo_calorias: 2200, consultation_summary: "Revisión." },
};

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/**
 * Supabase mínimo que apunta cada escritura, para poder exigir que una
 * resolución rechazada no escriba nada.
 */
function supabaseStub({
  existingPatient = { id: "p-existente" } as unknown,
  insertFails = false,
  updateFails = false,
} = {}) {
  const writes: Write[] = [];

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from(table: string) {
      let payload: unknown;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        insert: (value: unknown) => {
          payload = value;
          writes.push({ table, op: "insert", payload: value });
          return chain;
        },
        update: (value: unknown) => {
          payload = value;
          writes.push({ table, op: "update", payload: value });
          return chain;
        },
        maybeSingle: async () => ({
          data: table === "patients" ? existingPatient : null,
          error: null,
        }),
        single: async () => {
          if (table === "patients") {
            return insertFails
              ? { data: null, error: { message: "boom" } }
              : { data: { id: "p-nuevo" }, error: null };
          }
          return insertFails
            ? { data: null, error: { message: "boom" } }
            : { data: { id: "c-1", diet_version: 7 }, error: null };
        },
        then: undefined,
      };
      // `update` se espera sin `.single()`: devuelve su error al resolverse.
      (chain as { update: (v: unknown) => unknown }).update = (
        value: unknown,
      ) => {
        payload = value;
        writes.push({ table, op: "update", payload: value });
        return {
          ...chain,
          eq: async () =>
            updateFails ? { error: { message: "boom" } } : { error: null },
        };
      };
      void payload;
      return chain;
    },
  };

  createClient.mockResolvedValue(client);
  return writes;
}

const bodyFor = (
  resolution: string,
  overrides: Record<string, unknown> = {},
) => ({
  resolution,
  dietMd: DIETA,
  transcription: "consulta dictada",
  existingPatientId: "p-existente",
  extraction: EXTRACTION,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Esta ruta existe para que un choque de email no cueste una generación. Lo que
 * la hace barata es lo que NO importa: si arrastrara el motor de generación, un
 * reintento podría volver a pagar el modelo.
 */
describe("POST /api/resolve-identity-conflict", () => {
  it("no importa el motor de generación", async () => {
    const fuente = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/api/resolve-identity-conflict/route.ts", "utf8"),
    );

    expect(fuente).not.toContain("diet-generation-service");
    expect(fuente).not.toContain("streamDietGeneration");
  });

  it("«es el mismo paciente» cuelga la consulta de su ficha sin crear a nadie", async () => {
    const writes = supabaseStub();

    const response = await POST(request(bodyFor("mismo-paciente")));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.patientId).toBe("p-existente");
    expect(payload.dietVersion).toBe(7);
    expect(writes.filter((w) => w.table === "patients")).toEqual([]);
    expect(
      writes.filter((w) => w.table === "patient_consultations"),
    ).toHaveLength(1);
  });

  it("guarda la dieta que llega, no otra", async () => {
    const writes = supabaseStub();

    await POST(request(bodyFor("mismo-paciente")));

    const consulta = writes.find((w) => w.table === "patient_consultations")!;
    expect((consulta.payload as { diet_md: string }).diet_md).toBe(DIETA);
    expect((consulta.payload as { weight: number }).weight).toBe(94);
  });

  it("«el correo se dictó mal» crea el paciente sin correo y no toca la otra ficha", async () => {
    const writes = supabaseStub();

    const response = await POST(request(bodyFor("email-mal-dictado")));
    const payload = await response.json();

    expect(payload.patientId).toBe("p-nuevo");

    const altas = writes.filter((w) => w.table === "patients");
    expect(altas).toHaveLength(1);
    expect(altas[0].op).toBe("insert");
    expect(altas[0].payload).not.toHaveProperty("mail");
    expect(writes.some((w) => w.op === "update")).toBe(false);
  });

  it("«la ficha está mal» actualiza solo lo que el audio sí trae", async () => {
    const writes = supabaseStub();

    const response = await POST(request(bodyFor("datos-guardados-mal")));
    const payload = await response.json();

    expect(payload.patientId).toBe("p-existente");

    const update = writes.find((w) => w.op === "update")!;
    const campos = update.payload as Record<string, unknown>;
    expect(campos.age).toBe(41);
    // El audio no dictó teléfono: no puede borrar el que estaba guardado.
    expect(campos).not.toHaveProperty("phone");
    expect(
      writes.some((w) => w.op === "insert" && w.table === "patients"),
    ).toBe(false);
  });

  it("una salida desconocida se rechaza sin escribir nada", async () => {
    const writes = supabaseStub();

    const response = await POST(request(bodyFor("inventada")));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/no existe/i);
    expect(writes).toEqual([]);
  });

  it("una dieta vacía se rechaza sin escribir nada", async () => {
    const writes = supabaseStub();

    const response = await POST(
      request(bodyFor("mismo-paciente", { dietMd: "   " })),
    );

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("un paciente que no es del usuario responde 404 sin escribir nada", async () => {
    // RLS no lo devuelve, que es como se comporta con la ficha de otra.
    const writes = supabaseStub({ existingPatient: null });

    const response = await POST(request(bodyFor("mismo-paciente")));

    expect(response.status).toBe(404);
    expect(writes).toEqual([]);
  });

  /**
   * O está la consulta con su dieta, o no está nada. Un 500 que hubiera dejado
   * la consulta a medias sería peor que el fallo original.
   */
  it("si el insert de la consulta falla, responde 500 y lo dice en español", async () => {
    supabaseStub({ insertFails: true });

    const response = await POST(request(bodyFor("mismo-paciente")));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toMatch(/sigue en pantalla/i);
    expect(payload).not.toHaveProperty("consultationId");
  });

  it("si falla actualizar la ficha, no se guarda la consulta", async () => {
    const writes = supabaseStub({ updateFails: true });

    const response = await POST(request(bodyFor("datos-guardados-mal")));

    expect(response.status).toBe(500);
    expect(writes.some((w) => w.table === "patient_consultations")).toBe(false);
  });
});
