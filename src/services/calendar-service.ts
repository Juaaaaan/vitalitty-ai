import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/server";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  WeeklySummary,
} from "@/models/calendar/appointment.model";

/**
 * Columnas de una cita más el paciente resuelto a lo mínimo para pintarla y
 * para actuar sobre él. Deliberadamente sin datos clínicos: la agenda dice a
 * quién se ve y cuándo, no qué le pasa.
 */
const APPOINTMENT_COLUMNS =
  "id, patient_id, start_time, end_time, type, status, notes, patients(id, name_surnames)";

/** Fila tal como la devuelve Supabase, con el join del paciente anidado. */
type AppointmentRow = Omit<Appointment, "patients"> & {
  patients: { id: string; name_surnames: string } | null;
};

/**
 * Normaliza la fila a `Appointment`. El join viene como objeto o `null`; el
 * modelo espera `undefined` cuando no hay paciente, que es lo que la UI mira.
 */
function toAppointment(row: AppointmentRow): Appointment {
  const { patients, ...appointment } = row;

  return {
    ...appointment,
    notes: appointment.notes ?? undefined,
    patients: patients
      ? { id: patients.id, name_surnames: patients.name_surnames }
      : undefined,
  };
}

export interface AppointmentRange {
  /** Instante inicial, incluido. */
  from: Date;
  /** Instante final, excluido. */
  to: Date;
  types?: AppointmentType[];
  statuses?: AppointmentStatus[];
}

/**
 * Citas del usuario en un rango, ordenadas por inicio.
 *
 * El rango llega ya resuelto a instantes: quien llama decide la zona horaria
 * (`monthRange` y `weekRange` la aplican con la del servidor). La columna es
 * `timestamptz`, así que la comparación es sobre instantes y no sobre fechas
 * locales, que es lo que hace que "esta semana" no se corra una hora en marzo.
 *
 * `to` es exclusivo para que dos rangos consecutivos no compartan la cita de
 * medianoche.
 *
 * No filtra por `created_by`: lo hace la RLS. Las citas de otro usuario no
 * vuelven, así que la consulta no puede colarse a la agenda de nadie.
 */
export async function getAppointmentsInRange(
  supabase: SupabaseClient,
  range: AppointmentRange,
): Promise<Appointment[]> {
  let query = supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .gte("start_time", range.from.toISOString())
    .lt("start_time", range.to.toISOString())
    .order("start_time", { ascending: true });

  if (range.types?.length) query = query.in("type", range.types);
  if (range.statuses?.length) query = query.in("status", range.statuses);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as AppointmentRow[]).map(toAppointment);
}

/** Mes natural local, de su día 1 al día 1 del siguiente. */
export function monthRange(year: number, month: number): AppointmentRange {
  return { from: new Date(year, month, 1), to: new Date(year, month + 1, 1) };
}

/** Semana natural local de `reference`, de lunes a lunes. */
export function weekRange(reference: Date): AppointmentRange {
  const from = new Date(reference);
  // getDay() es 0 el domingo: ese día pertenece a la semana que empezó el lunes
  // anterior, seis días antes, no al lunes siguiente.
  const daysSinceMonday = (from.getDay() + 6) % 7;
  from.setDate(from.getDate() - daysSinceMonday);
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setDate(to.getDate() + 7);

  return { from, to };
}

/**
 * Resumen semanal a partir de las citas de la semana. Los bloqueos no cuentan:
 * no son pacientes vistos.
 */
export function buildWeeklySummary(appointments: Appointment[]): WeeklySummary {
  const relevant = appointments.filter(
    (appointment) =>
      appointment.type !== "bloqueo" && appointment.status !== "cancelled",
  );
  const completed = relevant.filter(
    (appointment) => appointment.status === "completed",
  ).length;
  const total = relevant.length;

  return {
    completed,
    total,
    message:
      total === 0
        ? "No tienes citas esta semana."
        : `Has completado ${completed} de ${total} citas de esta semana.`,
  };
}

export async function getAppointmentsForMonth(
  year: number,
  month: number,
): Promise<Appointment[]> {
  const supabase = await createClient();

  return getAppointmentsInRange(supabase, monthRange(year, month));
}

export async function getWeeklySummary(): Promise<WeeklySummary> {
  const supabase = await createClient();

  return buildWeeklySummary(
    await getAppointmentsInRange(supabase, weekRange(new Date())),
  );
}
