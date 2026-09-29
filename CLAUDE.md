# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`openspec/project.md` is the source of truth for stack, models and target architecture. This file expands on it with commands, layout and conventions — it must never contradict it.

## Commands

```bash
# Development
npm run dev           # Start dev server
npm run build         # Production build
npm run start         # Production server

# Code quality
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues automatically

# Testing
npm run test          # Run Vitest unit tests (watch mode)
npm run test:coverage # Coverage report (v8 provider)
npm run test:ui       # Vitest UI dashboard

# Run a single test file
npx vitest run app/__tests__/page.test.tsx
```

Pre-commit hooks (Husky) run `eslint --fix` + `prettier --write` on staged files automatically.

## Hard rules

These are non-negotiable. They are also encoded in `openspec/config.yaml` so every OpenSpec artifact inherits them.

1. **Client → route handlers, never Server Actions.** Client components call `/api/*` with `fetch`. Do not add new Server Actions and do not call one from a client component.
2. **No filesystem.** Vercel serverless: no `readFileSync`, no `path`-based asset loading, no runtime file access of any kind. Prompt templates and example diets live as TypeScript constants/modules in the repo.
3. **TanStack Table inputs must be referentially stable.** `data` and `columns` passed to `useReactTable` come from state or `useMemo`, never a literal built during render (`data: x ? [x] : []`). A new reference every render makes the table recompute rows and reset pagination, which re-renders, which builds a new reference: an infinite render loop that freezes the whole tab with no error and no stack trace. This was the real cause of the `/diets` freeze, long misattributed to batching several `setState` calls without `useTransition` (see `app/diets/page.tsx`).
4. **Never hand-edit `src/components/ui/`.** Those are shadcn/ui generated files — use the CLI.

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS v4 + shadcn/ui (Radix) + Supabase (Postgres + Storage) + Vercel.

**Models (target):**

| Stage                       | Model                      |
| --------------------------- | -------------------------- |
| Transcription               | OpenAI `gpt-4o-transcribe` |
| Diet generation             | Claude Opus                |
| Field extraction for the DB | Claude Haiku               |

### Target architecture — document-first

The diet is generated in **a single model pass with real example diets in context**, and stored as markdown. That markdown is the source of truth; structured fields are a light projection of it for querying, history and charts.

This is explicitly **not** an extract-to-JSON-then-fill-a-template pipeline. The core should behave like a ChatGPT/Claude "Project". What the app adds on top of a Project is what a Project cannot do: per-patient database, history, diet comparison across appointments, charts.

**Generation prompt ordering (for prompt caching):**

```
[ static: instructions + example diets ]   ← cached block, never varies
[ patient context ]
[ transcription ]
```

The static block goes first and is the only part eligible for caching. Anything patient-specific must come after it, or the cache is useless.

### Current state vs target

Known deltas and open items, so nobody documents them as done:

- **Time to first visible token not measured in the browser.** Server-side it is ~4–5 s to the first thinking summary. Acceptance check 8.2 of `2026-09-28-single-pass-diet-generation` was archived open, pending a manual measurement.
- **Generation hits `maxDuration`.** A full diet took 44–53 s before patient memory; a revision for a patient with 13 diets measured **59.6 s** in the browser against `maxDuration = 60`. On Vercel that run would likely be cut and not saved. Raise `maxDuration` per the deployment plan before relying on it.
- **Patient memory acceptance only partly verified.** `2026-09-28-add-patient-persistent-context` was archived with 7.1–7.4 open: "respect known restrictions without repeating them" is proven only at model level (synthetic patient), the cache read on a second generation was not checked, and new-patient / namesake flows were not run in the browser.
- **Only one example diet.** The static prompt block holds one real diet; adding a second is adding an element to `DIET_EXAMPLES`.
- **Patient memory can't forget.** The card takes the latest non-empty value of each clinical field, so a restriction that disappears is only overridden by what the new transcription says (the static prompt tells the model the transcription wins). There is no editable patient card yet.
- **Consultations saved before `add-patient-persistent-context` have no summary.** They are skipped in the memory; only their full diet is used when it is the latest one.
- **Audio is not stored.** It is transcribed and discarded; there is no audio bucket and no audio column. Only `audio_transcription` is persisted.

**Closed:** diet generation and extraction reached the target in change `2026-09-28-single-pass-diet-generation`: `src/services/diet-generation-service.ts` (single streamed pass, cached static block of instructions + example diets) and `src/services/consultation-extraction-service.ts` (structured output, in parallel, never blocks the document). `extraction-service.ts`, its template and `app/actions/` are gone; `upload-diet` became `POST /api/upload-diet`. Contracts in `openspec/specs/diet-generation/spec.md` and `openspec/specs/consultation-extraction/spec.md`.

**Closed:** persistent patient memory in change `2026-09-28-add-patient-persistent-context`: explicit new/existing choice before recording, memory (card + last 3 summaries + last diet) injected between the cached static block and the transcription, per-patient `diet_version` (DB trigger) and `consultation_summary`. The same change fixed the extraction schema, which the API had been rejecting with a `400` on every call (nullable `enum`, 26 union-typed params over the limit of 16): only numbers are nullable now, `""` / `[]` mean "not mentioned" and are normalized to `null`, and a test keeps it under 16 unions. Contracts in `openspec/specs/patient-context/spec.md` and `openspec/specs/consultation-patient-selection/spec.md`.

**Closed:** diet comparison across appointments in change `2026-09-29-add-diet-comparison`: the patient page compares each diet version N with N-1 (kcal, weight, portions per fixed food group with Δ, foods in/out, AI summary of what changed and why) and charts portions per diet, one line per group and unit. Two cached projections of `diet_md` on `patient_consultations` (`diet_portions`, `diet_changes`), computed lazily by `POST /api/diet-portions` and `POST /api/compare-diets` with the extraction model; the generation model is never called. Consecutive pairs only, no macros. Contracts in `openspec/specs/diet-comparison/spec.md` and `openspec/specs/patient-evolution/spec.md`.

**Closed:** weight history in change `2026-09-29-add-weight-history`: each consultation stores the weight dictated in it (`patient_consultations.weight`, `null` if none), `patients.weight` stays as the latest known value, and the patient page charts target kcal (bars) and weight (line) on separate axes. Pre-existing consultations were backfilled once from their transcriptions with `scripts/backfill-consultation-weight.ts`. Contracts in `openspec/specs/patient-evolution/spec.md` and `openspec/specs/consultation-extraction/spec.md`.

**Closed:** transcription reached the target in change `2026-09-28-switch-transcription-to-gpt4o`. `gpt-4o-transcribe`, `/api/transcribe` delegating to `transcribeAudio()`, 10 MB input cap → `413`. Its behaviour contract lives in `openspec/specs/audio-transcription/spec.md`.

### Routing & Pages

- `/` → client-side redirect to `/dashboard`
- `/login` → Supabase email/password auth
- `/dashboard` → Patient list with TanStack React Table CRUD
- `/dashboard/calendar` → Monthly appointments calendar (async server component)
- `/dashboard/patient/[id]` → Patient detail: data, an evolution chart (target kcal as bars + weight as a line, one axis each, one point per consultation) and the consultation history. Weight is stored per consultation in `patient_consultations.weight`; `patients.weight` only holds the latest known value. Below it: portions per food group across diet versions, and "Comparar dietas": pick a version N and see it against N-1 (kcal, weight, portions with Δ, foods in/out, AI summary of what changed and why). Consecutive pairs only; no macros — diets prescribe portions, not macro grams
- `/diets` → Choose new/existing patient → audio recording → transcription → diet generation → save consultation. Recording stays disabled until the patient choice is complete; the patient is never guessed from the transcription

### Route handlers

- `POST /api/transcribe` — multipart `audio` file → `{ text }`. Thin layer over `transcribeAudio()`: model, language and the 10 MB input cap live in the service, not here. `413` when the audio exceeds the cap, `400` with no audio, `500` on provider failure — every error body carries `error`, because the client reads it before looking at the status.
- `POST /api/process-consultation` — `{ transcription, patientMode: "new" | "existing", patientId? }` → NDJSON stream of `thinking` / `text` / `error` / `done` events. `400` on missing/invalid mode or `existing` without id; `404` when the patient isn't the user's — both before any model call. For `existing` it loads the patient memory (`src/services/patient-context-service.ts`: card with the latest known clinical values + summaries of the last 3 diets + last full diet) and injects it after the cached static block, before the transcription; `new` gets no memory and always creates a patient row (no email matching). Generation and extraction run in parallel; the consultation is inserted only when the stream closes cleanly, with the extraction's `consultation_summary` and the weight dictated in it (`null` if none — never copied from the patient), and `done` carries `consultationId` and `dietVersion` (assigned by a DB trigger, 1 for a new patient, N+1 otherwise). `maxDuration = 60`.
- `POST /api/diet-portions` — `{ patientId }` → `{ portions: [{ consultationId, dietVersion, createdAt, portions }], failed: [consultationId] }`. Projects (once, extraction model, 4 in parallel, each saved as it finishes) the portions of every diet of the patient that lacks `diet_portions` or has an older format version. Never returns `diet_md`. `400` without id, `404` when the patient isn't the user's. The patient page only calls it when some diet is missing portions. `maxDuration = 60`.
- `POST /api/compare-diets` — `{ consultationId }` → `{ previous, current, portions, added, removed, summary }`. Compares diet N with the previous existing version of the same patient. The result is cached in `diet_changes` of row N and reused while `previousConsultationId` still matches; never generates or edits a diet. "Why" comes from N's transcription (fallback: its `consultation_summary`; with neither, the summary says the reason is not recorded). `400` without id, `404` for someone else's / missing / diet-less consultation, `409` for a first diet, `500` on model failure — all with `error` in Spanish. `maxDuration = 60`.
- `POST /api/upload-diet` — `{ consultationId, patientId, dietMd }` → `{ success, url?, error? }`. Uploads to the private `diets` bucket, stores the file **path** in `patient_consultations.documento_url` (the column name is legacy; it holds a path, not a URL) and returns a 1 h signed URL. `404` when the consultation isn't the user's.

### Server vs Client split

- Server components handle data-heavy pages (calendar, patient detail)
- Client components (`"use client"`) handle interactivity (audio recorder, forms, table)
- Anything touching an API key or the service-role Supabase client stays server-side, behind a route handler

**Authentication:** Supabase Auth with SSR session refresh in `middleware.ts`. Client-side redirect to `/login` when unauthenticated.

**Storage:** one private bucket, `diets`, holding `{user_id}/{patient_id}/{consultation_id}.md`. Storage policies restrict each user to their own folder, mirroring the `created_by = auth.uid()` RLS on the tables. Links are signed on demand; never use `getPublicUrl()` — these are health data. Migrations live in `supabase/migrations/`.

### Folder Layout

```
app/
  api/              # Route handlers — the only way the client reaches the server
    transcribe/
    process-consultation/
    upload-diet/
  dashboard/        # Main authenticated pages
  login/            # Auth page
  diets/            # Audio + AI consultation flow
lib/                # Repo root, NOT under src/ — no @/ alias
  ai/openai.ts      # Shared OpenAI client (transcription)
  ai/anthropic.ts   # Shared Anthropic client (generation + extraction)
  supabase/         # client.ts (browser) + server.ts (SSR)
src/
  components/
    ui/             # shadcn/ui primitives (do not edit manually — use CLI)
    layout/         # App shell: sidebar, login form, theme toggle
    audio/          # Audio recorder + transcription display
    patients/       # Patient picker (keyed by id, shows contact to tell namesakes apart), diet comparison, portions chart
    calendar/       # Calendar client component
  services/         # Business logic: transcription, diet generation, extraction, calendar
  models/           # TypeScript types (audio, calendar, dashboard, extraction)
  constants/        # TanStack Table column definitions, example diets, magic numbers
  hooks/            # use-mobile.ts
  lib/utils.ts      # cn() helper (clsx + tailwind-merge)
middleware.ts       # Supabase SSR auth
scripts/            # One-off local scripts (e.g. weight backfill); never imported from app/ or src/, never deployed
supabase/migrations/ # SQL migrations (Storage buckets and policies)
openspec/           # Spec-driven change workflow (project.md, config.yaml, changes/)
```

### Import Alias

`@/*` maps to `src/` (`tsconfig.json`, `baseUrl: "src"`). Note `lib/` at the repo root is **outside** the alias — it is imported with relative paths.

### UI Components

shadcn/ui with **new-york** style. Add new components via:

```bash
npx shadcn@latest add <component>
```

### Testing

Vitest with jsdom environment. Tests live alongside pages in `__tests__/` subdirectories. Coverage is collected for `app/**/*.tsx` and `src/**/*.tsx`.
