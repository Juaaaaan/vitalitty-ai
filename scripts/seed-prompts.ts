/**
 * Seeds the Cerebro with the prompts the system already runs on.
 *
 * This is the step that makes the change safe to deploy: until a prompt row
 * exists, the generation falls back to the code constants, and once this has
 * run it reads version 1 — whose content is byte for byte that same constant.
 * Either way the diet comes out the same.
 *
 * The content is imported from `src/constants/brain-prompts.ts`, never pasted:
 * a copy here would drift from the fallback and the first generation after the
 * deploy would silently change behaviour.
 *
 * Run locally, never deployed:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node --no-warnings --env-file=.env.local \
 *     scripts/seed-prompts.ts --user <auth user id> [--dry-run] [--force]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY. The service role key bypasses RLS, which is what
 * lets the script write rows owned by `--user`: keep it out of the repo and out
 * of Vercel.
 *
 * Re-running is safe: a prompt that already exists is left alone unless
 * `--force` is passed, which adds a new version with the current constant and
 * activates it. Nothing is ever updated in place or deleted.
 *
 * Must not be imported from `app/` or `src/`: standalone Node script with its
 * own client.
 */
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_PROMPTS } from "../src/constants/brain-prompts.ts";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const userFlagIndex = process.argv.indexOf("--user");
const userId = userFlagIndex === -1 ? null : process.argv[userFlagIndex + 1];

if (!userId) {
  console.error(
    "Missing --user <auth user id>. The prompts are per user: without it there is nobody to own them.",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

async function seed() {
  for (const prompt of DEFAULT_PROMPTS) {
    const { data: existing, error: lookupError } = await supabase
      .from("prompts")
      .select("id, nombre, version_activa_id")
      .eq("created_by", userId)
      .eq("slug", prompt.slug)
      .maybeSingle();

    if (lookupError) throw new Error(`Lookup failed: ${lookupError.message}`);

    if (existing && !force) {
      console.log(`· ${prompt.slug}: already seeded, left untouched`);
      continue;
    }

    if (dryRun) {
      console.log(
        `· ${prompt.slug}: would ${existing ? "add a version to" : "create"} "${prompt.nombre}" (${prompt.contenido.length} chars)`,
      );
      continue;
    }

    let promptId = existing?.id as string | undefined;

    if (!promptId) {
      const { data: created, error: insertError } = await supabase
        .from("prompts")
        .insert({
          slug: prompt.slug,
          nombre: prompt.nombre,
          tipo: prompt.tipo,
          created_by: userId,
        })
        .select("id")
        .single();

      if (insertError)
        throw new Error(
          `Creating ${prompt.slug} failed: ${insertError.message}`,
        );
      promptId = created.id as string;
    }

    // The version number is assigned by the trigger, not here.
    const { data: version, error: versionError } = await supabase
      .from("prompt_versiones")
      .insert({
        prompt_id: promptId,
        contenido: prompt.contenido,
        nota_cambio: "Prompt original del código, sembrado sin cambios.",
        created_by: userId,
      })
      .select("id, version, contenido")
      .single();

    if (versionError)
      throw new Error(
        `Creating a version of ${prompt.slug} failed: ${versionError.message}`,
      );

    // The seed is the one case where creating and activating happen together:
    // nothing was active before, so there is no behaviour to protect from it.
    const { error: activateError } = await supabase
      .from("prompts")
      .update({
        version_activa_id: version.id,
        version_activada_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", promptId);

    if (activateError)
      throw new Error(
        `Activating ${prompt.slug} v${version.version} failed: ${activateError.message}`,
      );

    // Read back what the database actually stored, not what we sent: this is
    // the check that the seeded prompt composes the very same static block.
    const { data: stored, error: readbackError } = await supabase
      .from("prompt_versiones")
      .select("contenido")
      .eq("id", version.id)
      .single();

    if (readbackError)
      throw new Error(`Read-back failed: ${readbackError.message}`);

    if (stored.contenido !== prompt.contenido) {
      throw new Error(
        `Stored content of ${prompt.slug} differs from the constant: seeded ${prompt.contenido.length} chars, read back ${stored.contenido.length}.`,
      );
    }

    console.log(
      `✓ ${prompt.slug}: v${version.version} active, ${prompt.contenido.length} chars, identical to the constant`,
    );
  }
}

seed()
  .then(() => {
    console.log(dryRun ? "Dry run, nothing written." : "Done.");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
