/**
 * One-off backfill: recovers the weight dictated in each consultation saved
 * before `patient_consultations.weight` existed, from its stored transcription.
 *
 * Run locally, never deployed:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node --no-warnings --env-file=.env.local \
 *     scripts/backfill-consultation-weight.ts --dry-run
 *
 * Drop `--dry-run` to write. Reads NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY from the environment. The
 * service role key bypasses RLS to reach every user's consultations: keep it
 * out of the repo and out of Vercel.
 *
 * Only `weight` is written, and only when the model finds one. Rows that
 * already have a weight are never selected, so re-running is safe.
 *
 * Must not be imported from `app/` or `src/`: it is a standalone Node script
 * (Node runs the TypeScript directly), with its own clients and prompt.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-haiku-4-5";

// Deliberately without `cache_control`: far below Haiku's minimum cacheable
// prefix (4096 tokens), marking it would only pay the write premium.
const SYSTEM_PROMPT = `Extraes de la transcripción de una consulta nutricional el peso ACTUAL del paciente, medido o dicho en esa consulta.

- Normaliza siempre a kilogramos. "ochenta y dos con cinco" → 82.5
- No confundas el peso actual con el peso objetivo ("quiere llegar a 75"), un peso pasado ("hace un año pesaba 90") ni el de otra persona.
- Si la transcripción no dice el peso actual, devuelve null. Nunca lo estimes.`;

const SCHEMA = {
  type: "object",
  properties: {
    weight: {
      type: ["number", "null"],
      description: "Peso actual en kg, o null si no se dice",
    },
  },
  required: ["weight"],
  additionalProperties: false,
} as const;

const dryRun = process.argv.includes("--dry-run");

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing environment variable: ${names.join(" or ")}`);
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

async function extractWeight(transcription: string): Promise<number | null> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: transcription }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Weight extraction returned no text content");
  }

  const { weight } = JSON.parse(textBlock.text) as { weight: number | null };
  return typeof weight === "number" && weight > 0 ? weight : null;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("patient_consultations")
    .select("id, patient_id, created_at, audio_transcription")
    .is("weight", null)
    .not("audio_transcription", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Error loading consultations: ${error.message}`);

  console.log(
    `${rows.length} consultations without weight${dryRun ? " (dry run)" : ""}`,
  );

  let withWeight = 0;
  let withoutWeight = 0;
  let failed = 0;

  for (const row of rows) {
    const label = `${row.created_at.slice(0, 10)} ${row.id}`;
    try {
      const weight = await extractWeight(row.audio_transcription as string);

      if (weight == null) {
        withoutWeight++;
        console.log(`  ${label}: no weight dictated`);
        continue;
      }

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("patient_consultations")
          .update({ weight })
          .eq("id", row.id)
          .is("weight", null);
        if (updateError) throw new Error(updateError.message);
      }

      withWeight++;
      console.log(`  ${label}: ${weight} kg`);
    } catch (err) {
      failed++;
      console.error(
        `  ${label}: failed — ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(
    `\nProcessed ${rows.length}: ${withWeight} with weight, ${withoutWeight} without, ${failed} failed${dryRun ? " — nothing written (dry run)" : ""}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
