/**
 * Loads `vault/` into `documentos_conocimiento`, once.
 *
 * The vault lives in the repo but the runtime cannot read it (hard rule 2: no
 * filesystem on Vercel), so the knowledge has to end up in Postgres to reach a
 * generation. This is that one-off move, not an app feature.
 *
 * It refuses a file that still carries its Word conversion damage — no markdown
 * headings, an `<img>` pointing at a `media/` folder that is not in the repo,
 * HTML tables — unless `--force` is passed. See
 * `openspec/changes/cerebro-conocimiento-dinamico/vault-review.md`: loading the
 * 141-dish recipe book as it stands drags that problem into production.
 *
 * Run locally, never deployed:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node --no-warnings --env-file=.env.local \
 *     scripts/load-vault.ts --user <auth user id> [--dry-run] [--force]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY. The service role key bypasses RLS, which is what
 * lets the script write rows owned by `--user`: keep it out of the repo and out
 * of Vercel.
 *
 * Re-running leaves already-loaded documents alone (matched by slug).
 *
 * Must not be imported from `app/` or `src/`: standalone Node script with its
 * own client.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const userFlagIndex = process.argv.indexOf("--user");
const userId = userFlagIndex === -1 ? null : process.argv[userFlagIndex + 1];

if (!userId) {
  console.error("Missing --user <auth user id>: the documents are per user.");
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

/**
 * Metadata per vault file, decided in the review. `siempreIncluir` is reserved
 * for the editor protocol: everything else is selected by its tags, or the
 * whole 181k-character vault would enter every single generation.
 */
const PLAN: Record<
  string,
  { tipo: string; tags: string[]; siempreIncluir?: boolean }
> = {
  "PROTOCOLO_MAESTRO_PROMPTS_EDITOR_VITALITTY_v2_01-10-2026": {
    tipo: "protocolo",
    tags: ["editor", "estilo"],
    siempreIncluir: true,
  },
  "COMPENDIO_PUBMED_VITALITTY_01-10-2026": {
    tipo: "paper",
    tags: ["hipertrofia", "microbiota", "pms", "evidencia"],
  },
  Fuentes_cientificas_Vitalitty_01_Hipertrofia_Microbiota_Mujer: {
    tipo: "paper",
    tags: ["hipertrofia", "microbiota", "pms", "mujer"],
  },
  Biblioteca_Maestra_Suplementacion_Vitalitty_v1: {
    tipo: "suplementacion",
    tags: ["suplementacion", "creatina", "proteina"],
  },
  VITALITTY_Ampliacion_Banco_Maestro_50_Platos: {
    tipo: "recetario",
    tags: ["platos"],
  },
  VITALITTY_Recetario_Maestro_141_Platos: {
    tipo: "recetario",
    tags: ["platos"],
  },
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/** The Word-conversion damage the review found. Blocks the load unless forced. */
function conversionProblems(content: string): string[] {
  const problems: string[] = [];

  if (!/^#{1,6}\s/m.test(content)) problems.push("no markdown headings");
  if (/<img\s/i.test(content)) problems.push("carries an <img> tag");
  if (/<table[\s>]/i.test(content))
    problems.push("HTML tables instead of markdown");

  return problems;
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

async function load() {
  const vaultDir = path.join(process.cwd(), "vault");
  const files = readdirSync(vaultDir).filter((file) => file.endsWith(".md"));

  let loaded = 0;
  let skipped = 0;

  for (const file of files.sort()) {
    const name = file.replace(/\.md$/, "");
    const content = readFileSync(path.join(vaultDir, file), "utf8");

    if (content.trim().length === 0) {
      console.log(`· ${file}: empty, skipped`);
      skipped += 1;
      continue;
    }

    const plan = PLAN[name];
    if (!plan) {
      console.log(`· ${file}: no metadata planned for it, skipped`);
      skipped += 1;
      continue;
    }

    const problems = conversionProblems(content);
    if (problems.length > 0 && !force) {
      console.log(
        `✗ ${file}: ${problems.join("; ")}. Clean it up or re-run with --force.`,
      );
      skipped += 1;
      continue;
    }
    if (problems.length > 0) {
      console.warn(
        `! ${file}: loading anyway (--force): ${problems.join("; ")}`,
      );
    }

    const titulo = name.replace(/[_-]+/g, " ");
    const slug = slugify(name);

    const { data: existing, error: lookupError } = await supabase
      .from("documentos_conocimiento")
      .select("id")
      .eq("created_by", userId)
      .eq("slug", slug)
      .maybeSingle();

    if (lookupError) throw new Error(`Lookup failed: ${lookupError.message}`);

    if (existing) {
      console.log(`· ${file}: already loaded, left untouched`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(
        `· ${file}: would load as "${titulo}" (${plan.tipo}, tags ${plan.tags.join("/")}${plan.siempreIncluir ? ", always included" : ""}, ${content.length} chars)`,
      );
      continue;
    }

    const { data: document, error: insertError } = await supabase
      .from("documentos_conocimiento")
      .insert({
        slug,
        titulo,
        tipo: plan.tipo,
        tags: plan.tags,
        siempre_incluir: plan.siempreIncluir ?? false,
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertError)
      throw new Error(`Creating ${slug} failed: ${insertError.message}`);

    // The version number comes from the trigger.
    const { data: version, error: versionError } = await supabase
      .from("documento_versiones")
      .insert({
        documento_id: document.id,
        contenido_md: content,
        nota_cambio: `Carga inicial desde vault/${file}.`,
        created_by: userId,
      })
      .select("id, contenido_md")
      .single();

    if (versionError)
      throw new Error(
        `Creating a version of ${slug} failed: ${versionError.message}`,
      );

    const { error: activateError } = await supabase
      .from("documentos_conocimiento")
      .update({
        version_activa_id: version.id,
        version_activada_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", document.id);

    if (activateError)
      throw new Error(`Activating ${slug} failed: ${activateError.message}`);

    // Read-back check: what the file says is what the database holds.
    if (version.contenido_md !== content) {
      throw new Error(
        `Stored content of ${slug} differs from the file: ${content.length} chars in, ${version.contenido_md.length} read back.`,
      );
    }

    console.log(
      `✓ ${file}: loaded as "${titulo}", v1 active, ${content.length} chars`,
    );
    loaded += 1;
  }

  console.log(
    dryRun
      ? "Dry run, nothing written."
      : `Done: ${loaded} loaded, ${skipped} skipped.`,
  );
}

load().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
