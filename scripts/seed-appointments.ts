/**
 * Seeds appointments for local work. There is no agenda UI yet, so without
 * this the calendar and `pacientes_por_criterio` have nothing real to read.
 *
 * Run locally, never deployed:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node --no-warnings --env-file=.env.local \
 *     scripts/seed-appointments.ts --user <auth user id> [--dry-run]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY. The service role key bypasses RLS, which is what
 * lets the script write rows owned by `--user`: keep it out of the repo and
 * out of Vercel.
 *
 * Dates are relative to the run, so the seeded week is always "this week".
 * Re-running adds more rows; it does not clean up. `--clear` deletes this
 * user's appointments first, for a repeatable state.
 *
 * Must not be imported from `app/` or `src/`: standalone Node script with its
 * own client.
 */
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");
const clear = process.argv.includes("--clear");

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing environment variable: ${names.join(" or ")}`);
}

function requireArg(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing argument: ${flag} <value>`);
  }
  return value;
}

const userId = requireArg("--user");

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

/** Monday 00:00 of the current local week. */
function mondayOfThisWeek(): Date {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function at(dayOffset: number, hour: number, minutes = 0): Date {
  const date = mondayOfThisWeek();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minutes, 0, 0);
  return date;
}

type Seed = {
  dayOffset: number;
  hour: number;
  minutes?: number;
  durationMinutes: number;
  type: "seguimiento" | "primera_cita" | "revision" | "urgente" | "bloqueo";
  status?: "pending" | "completed" | "cancelled";
  notes?: string;
  /** false for a `bloqueo`, which owns no patient. */
  withPatient: boolean;
};

/**
 * A week with at least two `revision` appointments, which is the case the
 * assistant is asked about ("who has a review this week"), plus one block and
 * one appointment already completed.
 */
const SEEDS: Seed[] = [
  {
    dayOffset: 0,
    hour: 9,
    durationMinutes: 30,
    type: "revision",
    withPatient: true,
  },
  {
    dayOffset: 1,
    hour: 10,
    durationMinutes: 45,
    type: "seguimiento",
    withPatient: true,
  },
  {
    dayOffset: 2,
    hour: 11,
    minutes: 30,
    durationMinutes: 30,
    type: "revision",
    withPatient: true,
  },
  {
    dayOffset: 2,
    hour: 14,
    durationMinutes: 60,
    type: "bloqueo",
    notes: "Comida",
    withPatient: false,
  },
  {
    dayOffset: 3,
    hour: 9,
    durationMinutes: 30,
    type: "primera_cita",
    status: "completed",
    withPatient: true,
  },
  {
    dayOffset: 4,
    hour: 17,
    durationMinutes: 30,
    type: "urgente",
    withPatient: true,
  },
];

async function main() {
  const { data: patients, error: patientsError } = await supabase
    .from("patients")
    .select("id, name_surnames")
    .eq("created_by", userId)
    .order("created_at", { ascending: true });

  if (patientsError) {
    throw new Error(`Error loading patients: ${patientsError.message}`);
  }
  if (!patients?.length) {
    throw new Error(`User ${userId} has no patients: nothing to book.`);
  }

  if (clear && !dryRun) {
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("created_by", userId);
    if (error) throw new Error(`Error clearing appointments: ${error.message}`);
    console.log(`Cleared previous appointments of ${userId}`);
  }

  const rows = SEEDS.map((seed, index) => {
    const start = at(seed.dayOffset, seed.hour, seed.minutes);
    const end = new Date(start.getTime() + seed.durationMinutes * 60_000);
    const patient = patients[index % patients.length];

    return {
      patient_id: seed.withPatient ? patient.id : null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      type: seed.type,
      status: seed.status ?? "pending",
      notes: seed.notes ?? null,
      created_by: userId,
    };
  });

  for (const [index, row] of rows.entries()) {
    const patient = patients[index % patients.length];
    console.log(
      `  ${new Date(row.start_time).toLocaleString("es-ES")} ${row.type} ${
        row.patient_id ? patient.name_surnames : "—"
      }`,
    );
  }

  if (dryRun) {
    console.log(`\n${rows.length} appointments — nothing written (dry run)`);
    return;
  }

  const { error } = await supabase.from("appointments").insert(rows);

  if (error) throw new Error(`Error inserting appointments: ${error.message}`);

  console.log(`\nInserted ${rows.length} appointments for ${userId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
