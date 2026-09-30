import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWeeklySummary,
  getAppointmentsInRange,
  monthRange,
  weekRange,
} from "@/services/calendar-service";
import type { Appointment } from "@/models/calendar/appointment.model";

type Call = {
  table: string;
  filters: Record<string, unknown>;
  order?: string;
};

/**
 * Cliente falso que registra la consulta montada y devuelve las filas dadas.
 * Cada método encadena y el objeto es esperable, igual que el builder real.
 */
function fakeSupabase(rows: unknown[]) {
  const call: Call = { table: "", filters: {} };

  const builder = {
    select: () => builder,
    gte: (column: string, value: unknown) => {
      call.filters[`gte:${column}`] = value;
      return builder;
    },
    lt: (column: string, value: unknown) => {
      call.filters[`lt:${column}`] = value;
      return builder;
    },
    in: (column: string, value: unknown) => {
      call.filters[`in:${column}`] = value;
      return builder;
    },
    order: (column: string, options: { ascending: boolean }) => {
      call.order = `${column}:${options.ascending ? "asc" : "desc"}`;
      return builder;
    },
    then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };

  const supabase = {
    from: (table: string) => {
      call.table = table;
      return builder;
    },
  } as unknown as SupabaseClient;

  return { supabase, call };
}

const REVIEW_ROW = {
  id: "a1",
  patient_id: "p1",
  start_time: "2026-09-29T08:00:00.000Z",
  end_time: "2026-09-29T08:30:00.000Z",
  type: "revision",
  status: "pending",
  notes: null,
  patients: { id: "p1", name_surnames: "Rubén Díaz" },
};

const BLOCK_ROW = {
  id: "a2",
  patient_id: null,
  start_time: "2026-09-30T12:00:00.000Z",
  end_time: "2026-09-30T13:00:00.000Z",
  type: "bloqueo",
  status: "pending",
  notes: "Comida",
  patients: null,
};

describe("getAppointmentsInRange", () => {
  it("devuelve las citas del rango con el paciente resuelto", async () => {
    const { supabase, call } = fakeSupabase([REVIEW_ROW, BLOCK_ROW]);

    const appointments = await getAppointmentsInRange(supabase, {
      from: new Date("2026-09-28T00:00:00.000Z"),
      to: new Date("2026-10-05T00:00:00.000Z"),
    });

    expect(call.table).toBe("appointments");
    expect(call.order).toBe("start_time:asc");
    expect(call.filters["gte:start_time"]).toBe("2026-09-28T00:00:00.000Z");
    expect(call.filters["lt:start_time"]).toBe("2026-10-05T00:00:00.000Z");

    expect(appointments).toHaveLength(2);
    expect(appointments[0].patients).toEqual({
      id: "p1",
      name_surnames: "Rubén Díaz",
    });
    // Un bloqueo no tiene paciente: el join vuelve null y el modelo espera
    // undefined, que es lo que la UI comprueba.
    expect(appointments[1].patients).toBeUndefined();
  });

  it("un rango sin citas devuelve una lista vacía", async () => {
    const { supabase } = fakeSupabase([]);

    await expect(
      getAppointmentsInRange(supabase, {
        from: new Date("2026-12-01T00:00:00.000Z"),
        to: new Date("2026-12-08T00:00:00.000Z"),
      }),
    ).resolves.toEqual([]);
  });

  it("filtra por tipo y por estado cuando se piden", async () => {
    const { supabase, call } = fakeSupabase([REVIEW_ROW]);

    await getAppointmentsInRange(supabase, {
      from: new Date("2026-09-28T00:00:00.000Z"),
      to: new Date("2026-10-05T00:00:00.000Z"),
      types: ["revision"],
      statuses: ["pending"],
    });

    expect(call.filters["in:type"]).toEqual(["revision"]);
    expect(call.filters["in:status"]).toEqual(["pending"]);
  });

  it("sin tipos ni estados no añade esos filtros", async () => {
    const { supabase, call } = fakeSupabase([REVIEW_ROW]);

    await getAppointmentsInRange(supabase, {
      from: new Date("2026-09-28T00:00:00.000Z"),
      to: new Date("2026-10-05T00:00:00.000Z"),
      types: [],
    });

    expect(call.filters["in:type"]).toBeUndefined();
    expect(call.filters["in:status"]).toBeUndefined();
  });
});

describe("monthRange", () => {
  it("cubre el mes natural local, con el final excluido", () => {
    const { from, to } = monthRange(2026, 8);

    expect(from).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
  });
});

describe("weekRange", () => {
  it("empieza el lunes de esa semana", () => {
    // Miércoles.
    const { from, to } = weekRange(new Date(2026, 8, 30, 17, 45));

    expect(from).toEqual(new Date(2026, 8, 28, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 9, 5, 0, 0, 0, 0));
  });

  it("el domingo pertenece a la semana que empezó el lunes anterior", () => {
    const { from } = weekRange(new Date(2026, 9, 4, 10, 0));

    expect(from).toEqual(new Date(2026, 8, 28, 0, 0, 0, 0));
  });
});

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a",
    patient_id: "p",
    start_time: "2026-09-29T08:00:00.000Z",
    end_time: "2026-09-29T08:30:00.000Z",
    type: "seguimiento",
    status: "pending",
    ...overrides,
  };
}

describe("buildWeeklySummary", () => {
  it("cuenta las completadas sobre las citas de pacientes", () => {
    const summary = buildWeeklySummary([
      appointment({ status: "completed" }),
      appointment({ status: "pending" }),
      appointment({ type: "bloqueo", patient_id: null }),
      appointment({ status: "cancelled" }),
    ]);

    expect(summary.completed).toBe(1);
    expect(summary.total).toBe(2);
    expect(summary.message).toContain("1 de 2");
  });

  it("una semana sin citas lo dice", () => {
    const summary = buildWeeklySummary([]);

    expect(summary).toEqual({
      completed: 0,
      total: 0,
      message: "No tienes citas esta semana.",
    });
  });
});
