# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`openspec/project.md` is the source of truth for stack, models and target architecture. This file expands on it with commands, layout and conventions — it must never contradict it.

## Commands

> **Package manager: pnpm.** The repo has `pnpm-lock.yaml` and a pnpm-shaped
> `node_modules`. Install with `pnpm add` / `pnpm install`: `npm install` crashes
> inside npm's arborist (`Cannot read properties of null (reading 'matches')`)
> when it walks the `node_modules/.pnpm` tree. The `npm run <script>` commands
> below do work, since they only run binaries already installed.

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

### Markdown contract

The generated document follows a closed contract, shared by three places that would silently drift apart otherwise: the static prompt block that demands it (`src/services/diet-generation-service.ts`), the example diets that comply with it (`src/constants/diet-examples.ts`) and the parser the template reads it with (`src/services/diet-document-parser.ts`). It lives in `src/constants/diet-pdf/diet-contract.ts`, and `src/services/__tests__/diet-contract-sync.test.ts` is the alarm if one of them moves.

```
---
paciente / version / proxima_revision / calorias      <- no macros
---
## Objetivos · ## Suplementación · ## Cantidades · ## Pre/Post-entreno
## Plan semanal
### Lunes[: actividad]        (or ### Turno mañana / ### Turno tarde)
**COMIDA** / **MERIENDA** / **CENA**
## Observaciones
```

Day vs shift is inferred from the heading, never from an extra frontmatter field. The template renders the contract sections that are present, in contract order, omits the missing ones and gives no layout to anything else. A document with no frontmatter renders raw and cannot be exported.

Inside a day, **any** line that is just `**text**` is a meal label — no closed vocabulary. An earlier whitelist silently dropped every meal, because the generator writes the time into the label (`**COMIDA (15:00)**`) and uses names no list covers (`**PRIMERA INGESTA**`, `**POST-PÁDEL**`, `**PRE-CAMA**`); the PDF came out with seven day headings and no food. `###` inside a prose section becomes a subheading, which is how `## Observaciones` groups Horarios / Alimentos / Técnicas / Hábitos.

### The assistant — a bounded agent

`/asistente` runs an Anthropic tool-use loop inside a route handler. The model gets a closed catalogue of domain tools (`src/services/assistant/catalog.ts`) and nothing else: no SQL, no shell, no file access. Every tool runs with the session's Supabase client, so RLS — not the prompt — is what keeps it inside the user's own patients.

A signed PDF URL never goes through the model. When a tool returns a document, the loop splits it: the URL leaves as its own `document` event that the page renders as "Ver dieta v17 · 29 sept 2026", and the model is told only the version, the date and that the link is already on screen. The prompt forbids writing URLs. The date shown is the consultation's, i.e. when that version was created — `patient_consultations` has no `updated_at`, so there is no modification date to show.

**Reads run free, writes are confirmed.** Each tool declares `kind: "read" | "write"` next to its definition, and that flag is what the dispatcher acts on. The loop only imports `read-tools.ts`, so a write tool is not merely discouraged there — it is unreachable. A write is turned into a proposal by `proposals.ts` (which loads neither Chromium nor the generation model) and only ever executed by `POST /api/assistant/confirm`, which revalidates the tool, the arguments and the ownership. `catalog.test.ts` is the alarm if a write tool ever appears in the read dispatcher.

That split also buys the time budget: the loop and a full diet generation cannot share one `maxDuration = 60`. `generar_dieta` reuses the generation engine with an instruction instead of a transcription and, once confirmed, saves a **new diet version** (the DB trigger assigns N+1); it never overwrites the current one.

### The PDF template

One template (`src/services/diet-template.ts`) feeds both the on-screen preview and the print. Brand assets — logo, Instagram icon, Tinos and Carlito (metric clones of Times New Roman and Calibri, both SIL OFL 1.1) — are data URIs in `src/constants/diet-pdf/`, both because of the no-filesystem rule and so the render is hermetic: a font fetched over the network could fail and silently repaginate the document.

`DIET_TEMPLATE_VERSION` in `diet-contract.ts` goes into the PDF's stored hash, so bumping it invalidates every saved PDF and each one re-renders on next request. Bump it whenever the layout, the parser or a brand asset changes — otherwise a template fix never reaches already-approved documents, since their markdown hasn't changed.

Printing is **two passes merged with pdf-lib**: the cover alone, then the body with `headerTemplate`/`footerTemplate`. That's forced by Chrome, not chosen: `position: fixed` is **not** repeated per page when printing, and `counter(page)` only has a value inside `@page` margin boxes. The header/footer templates are generated from the same brand constants, so the CSS is duplicated but never the values.

Colours, metrics and the footer's literal text were extracted from `public/diets_example/SANDRA_DE_GREGORIO_5.pdf`, which does carry text and geometry. One defect of that original is deliberately not reproduced: its body reaches y=85.1 pt while its footer spans 30.7–87.7 pt, so on its page 3 the footer covers a dinner line.

### Current state vs target

Known deltas and open items, so nobody documents them as done:

- **Time to first visible token not measured in the browser.** Server-side it is ~4–5 s to the first thinking summary. Acceptance check 8.2 of `2026-09-28-single-pass-diet-generation` was archived open, pending a manual measurement.
- **Generation hits `maxDuration`.** A full diet took 44–53 s before patient memory; a revision for a patient with 13 diets measured **59.6 s** in the browser against `maxDuration = 60`. On Vercel that run would likely be cut and not saved. Raise `maxDuration` per the deployment plan before relying on it.
- **Patient memory acceptance only partly verified.** `2026-09-28-add-patient-persistent-context` was archived with 7.1–7.4 open: "respect known restrictions without repeating them" is proven only at model level (synthetic patient), the cache read on a second generation was not checked, and new-patient / namesake flows were not run in the browser.
- **Only one example diet.** The static prompt block holds one real diet; adding a second is adding an element to `DIET_EXAMPLES`.
- **Diets saved before the markdown contract have no PDF.** They lack frontmatter, render raw and are deliberately not backfilled; the patient page shows "Sin PDF" for them.
- **Approving a diet took 17 s end to end in local dev** (cold Chrome + two print passes + pdf-lib merge + upload + signing); a cached re-request is ~0.7 s and a regeneration after an edit ~2.3 s. Measured with the system Chrome on macOS, so it does **not** predict `@sparticuz/chromium` unpacking its binary on Vercel — re-measure there before trusting `maxDuration = 60`.
- **The model still writes some macronutrient grams.** A real generation produced "45 g HC", "200-210 g diarios (≈2,2 g/kg)" in Objetivos and Cantidades, although the contract forbids macro grams and asks for amounts per food group. It doesn't break the template, but the prompt rule isn't holding — partly because the dictated consultation itself asks for kcal/kg and a protein target.
- **Patient memory can't forget.** The card takes the latest non-empty value of each clinical field, so a restriction that disappears is only overridden by what the new transcription says (the static prompt tells the model the transcription wins). There is no editable patient card yet.
- **Consultations saved before `add-patient-persistent-context` have no summary.** They are skipped in the memory; only their full diet is used when it is the latest one.
- **Assistant timings, measured in the browser against `maxDuration = 60` (local dev, 2026-09-29).** A read turn with one tool: 3.3 s, first event at 2.1 s. Three tools: 7.6 s. A turn whose comparison was not yet cached: ~35 s — `comparar_dietas` in the cold path is by far the most expensive read. A confirmed `generar_dieta`: **~50 s** end to end, the same margin as `/api/process-consultation` and the reason generation stays out of the loop. A confirmed `render_pdf` (render + upload + sign): under 35 s with the system Chrome. None of it predicts `@sparticuz/chromium` unpacking on Vercel: re-measure there.
- **The agenda starts empty.** `appointments` is a real table now, but there is no UI to create an appointment yet: they are seeded with `scripts/seed-appointments.ts` (needs the service-role key). Until then the calendar and `pacientes_por_criterio` have nothing to show.
- **The calendar only loads the current month.** Navigating to another month shows no appointments, because the server component fetches one month. That predates this change; the empty-agenda notice is deliberately shown only for the loaded month, so it never claims a month is empty when it was simply not fetched.
- **Audio is not stored.** It is transcribed and discarded; there is no audio bucket and no audio column. Only `audio_transcription` is persisted.

**Closed:** diet generation and extraction reached the target in change `2026-09-28-single-pass-diet-generation`: `src/services/diet-generation-service.ts` (single streamed pass, cached static block of instructions + example diets) and `src/services/consultation-extraction-service.ts` (structured output, in parallel, never blocks the document). `extraction-service.ts`, its template and `app/actions/` are gone; `upload-diet` became `POST /api/upload-diet`. Contracts in `openspec/specs/diet-generation/spec.md` and `openspec/specs/consultation-extraction/spec.md`.

**Closed:** persistent patient memory in change `2026-09-28-add-patient-persistent-context`: explicit new/existing choice before recording, memory (card + last 3 summaries + last diet) injected between the cached static block and the transcription, per-patient `diet_version` (DB trigger) and `consultation_summary`. The same change fixed the extraction schema, which the API had been rejecting with a `400` on every call (nullable `enum`, 26 union-typed params over the limit of 16): only numbers are nullable now, `""` / `[]` mean "not mentioned" and are normalized to `null`, and a test keeps it under 16 unions. Contracts in `openspec/specs/patient-context/spec.md` and `openspec/specs/consultation-patient-selection/spec.md`.

**Closed:** diet comparison across appointments in change `2026-09-29-add-diet-comparison`: the patient page compares each diet version N with N-1 (kcal, weight, portions per fixed food group with Δ, foods in/out, AI summary of what changed and why) and charts portions per diet, one line per group and unit. Two cached projections of `diet_md` on `patient_consultations` (`diet_portions`, `diet_changes`), computed lazily by `POST /api/diet-portions` and `POST /api/compare-diets` with the extraction model; the generation model is never called. Consecutive pairs only, no macros. Contracts in `openspec/specs/diet-comparison/spec.md` and `openspec/specs/patient-evolution/spec.md`.

**Closed:** weight history in change `2026-09-29-add-weight-history`: each consultation stores the weight dictated in it (`patient_consultations.weight`, `null` if none), `patients.weight` stays as the latest known value, and the patient page charts target kcal (bars) and weight (line) on separate axes. Pre-existing consultations were backfilled once from their transcriptions with `scripts/backfill-consultation-weight.ts`. Contracts in `openspec/specs/patient-evolution/spec.md` and `openspec/specs/consultation-extraction/spec.md`.

**Closed:** the branded PDF in change `2026-09-29-add-branded-diet-pdf`: the generated markdown follows a closed contract, one template feeds both the on-screen preview and the print, and `/diets` gained preview → Modificar → Aprobar, with the PDF created only on approval. `POST /api/diet-preview`, `PUT /api/diet-document` and `POST /api/diet-pdf`; `pdf_path` and `pdf_source_hash` on `patient_consultations`; the `.pdf` next to its `.md` in the private `diets` bucket, whose config was widened to accept `application/pdf`. Contracts in `openspec/specs/diet-document-template/spec.md`, `openspec/specs/diet-pdf-export/spec.md` and `openspec/specs/diet-document-editing/spec.md`.

**Closed:** transcription reached the target in change `2026-09-28-switch-transcription-to-gpt4o`. `gpt-4o-transcribe`, `/api/transcribe` delegating to `transcribeAudio()`, 10 MB input cap → `413`. Its behaviour contract lives in `openspec/specs/audio-transcription/spec.md`.

### Routing & Pages

- `/` → client-side redirect to `/dashboard`
- `/login` → Supabase email/password auth
- `/dashboard` → Patient list with TanStack React Table CRUD
- `/dashboard/calendar` → Monthly appointments calendar (async server component), reading the real `appointments` table. It used to render a hardcoded mock, so it starts empty until appointments are seeded (`scripts/seed-appointments.ts`)
- `/dashboard/patient/[id]` → Patient detail: data, an evolution chart (target kcal as bars + weight as a line, one axis each, one point per consultation) and the consultation history. Weight is stored per consultation in `patient_consultations.weight`; `patients.weight` only holds the latest known value. Below it: portions per food group across diet versions, and "Comparar dietas": pick a version N and see it against N-1 (kcal, weight, portions with Δ, foods in/out, AI summary of what changed and why). Consecutive pairs only; no macros — diets prescribe portions, not macro grams
- `/asistente` → Assistant: ask in natural language about your own patients, their diets, their evolution and the agenda. The model never sees SQL or a shell — it calls a closed catalogue of domain tools that the server executes. Reads run on their own; anything that writes (`generar_dieta`, `render_pdf` when the PDF must be made) is **proposed** and only runs after an explicit confirmation. Input by chat or by dictation (reuses `POST /api/transcribe`; the text lands in the box, it is never sent on its own). The thread is ephemeral: it lives in React state and is resent whole on each request, and nothing is persisted
- `/diets` → Choose new/existing patient → audio recording → transcription → diet generation → save consultation → **branded HTML preview → Modificar (edit the markdown) → Aprobar (renders and stores the PDF, then offers the download)**. Nothing reaches the user's disk before that approval, and no PDF exists until then. Recording stays disabled until the patient choice is complete; the patient is never guessed from the transcription

### Route handlers

- `POST /api/transcribe` — multipart `audio` file → `{ text }`. Thin layer over `transcribeAudio()`: model, language and the 10 MB input cap live in the service, not here. `413` when the audio exceeds the cap, `400` with no audio, `500` on provider failure — every error body carries `error`, because the client reads it before looking at the status.
- `POST /api/process-consultation` — `{ transcription, patientMode: "new" | "existing", patientId? }` → NDJSON stream of `thinking` / `text` / `error` / `done` events. `400` on missing/invalid mode or `existing` without id; `404` when the patient isn't the user's — both before any model call. For `existing` it loads the patient memory (`src/services/patient-context-service.ts`: card with the latest known clinical values + summaries of the last 3 diets + last full diet) and injects it after the cached static block, before the transcription; `new` gets no memory and always creates a patient row (no email matching). Generation and extraction run in parallel; the consultation is inserted only when the stream closes cleanly, with the extraction's `consultation_summary` and the weight dictated in it (`null` if none — never copied from the patient), and `done` carries `consultationId` and `dietVersion` (assigned by a DB trigger, 1 for a new patient, N+1 otherwise). `maxDuration = 60`.
- `POST /api/assistant` — `{ messages }` (the whole thread, last one from the user) → NDJSON stream of `text` / `tool_start` / `tool_end` / `proposal` / `error` / `done`. Runs the Anthropic tool-use loop server-side with the extraction model: read tools execute on their own, write tools are **not executed** — the turn ends with a `proposal` event. At most 8 tool iterations per turn; hitting the cap closes the turn saying so. `400` on an empty or malformed thread, `401` without a session. `maxDuration = 60`.
- `POST /api/assistant/confirm` — `{ tool, input }` → `{ result }`. The only place the assistant writes, and the only one that generates a diet or renders a PDF — hence its own `maxDuration = 60`, which is why neither runs inside the loop. It revalidates everything: that the tool exists and is a write tool, that the arguments are valid and (via RLS, inside the executor) that the patient is the user's. Having been proposed earlier is not a permission. `400` on an unknown or read-only tool, `404` on someone else's patient, `500` saying nothing was saved.
- `POST /api/diet-portions` — `{ patientId }` → `{ portions: [{ consultationId, dietVersion, createdAt, portions }], failed: [consultationId] }`. Projects (once, extraction model, 4 in parallel, each saved as it finishes) the portions of every diet of the patient that lacks `diet_portions` or has an older format version. Never returns `diet_md`. `400` without id, `404` when the patient isn't the user's. The patient page only calls it when some diet is missing portions. `maxDuration = 60`.
- `POST /api/compare-diets` — `{ consultationId }` → `{ previous, current, portions, added, removed, summary }`. Compares diet N with the previous existing version of the same patient. The result is cached in `diet_changes` of row N and reused while `previousConsultationId` still matches; never generates or edits a diet. "Why" comes from N's transcription (fallback: its `consultation_summary`; with neither, the summary says the reason is not recorded). `400` without id, `404` for someone else's / missing / diet-less consultation, `409` for a first diet, `500` on model failure — all with `error` in Spanish. `maxDuration = 60`.
- `POST /api/diet-preview` — `{ consultationId }` → `{ html, structured }`. Lays the consultation's `diet_md` out with the brand template and returns the HTML, which the client paints in an isolated iframe. `structured` is false for a document that doesn't follow the markdown contract — those render raw and can't be exported. Deliberately imports neither `puppeteer-core` nor `pdf-lib`, so the route carries no Chromium. `400` without id, `404` when the consultation isn't the user's.
- `PUT /api/diet-document` — `{ consultationId, dietMd }` → `{ success }`. Rewrites the consultation's document. Doesn't touch `diet_version` (it's the same diet, corrected) nor `pdf_path`/`pdf_source_hash` — an edit invalidates the stored PDF by itself, because its hash stops matching. `400` on missing id or empty document, `404` on someone else's consultation.
- `POST /api/diet-pdf` — `{ consultationId }` → `{ url }`. Serves the branded PDF. The PDF is a **cache of `diet_md` plus `DIET_TEMPLATE_VERSION`**: if `pdf_path` exists and `pdf_source_hash` matches, the stored file is signed and returned; otherwise it renders, uploads to `diets/{user_id}/{patient_id}/{consultation_id}.pdf`, updates both columns and then signs. The only route that loads Chromium, hence its own `maxDuration = 60`. `409` for a document with no frontmatter, `400`/`404`/`500` otherwise — all with `error` in Spanish.
- `POST /api/upload-diet` — `{ consultationId, patientId, dietMd }` → `{ success, url?, error? }`. Uploads to the private `diets` bucket, stores the file **path** in `patient_consultations.documento_url` (the column name is legacy; it holds a path, not a URL) and returns a 1 h signed URL. `404` when the consultation isn't the user's.

### Server vs Client split

- Server components handle data-heavy pages (calendar, patient detail)
- Client components (`"use client"`) handle interactivity (audio recorder, forms, table)
- Anything touching an API key or the service-role Supabase client stays server-side, behind a route handler

**Authentication:** Supabase Auth with SSR session refresh in `middleware.ts`. Client-side redirect to `/login` when unauthenticated.

**Storage:** one private bucket, `diets`, holding `{user_id}/{patient_id}/{consultation_id}.md` and, next to it, `.pdf` for the approved branded document. No separate bucket: the existing per-user policies already cover both. The bucket's own config did need widening though — it was created accepting only `text/markdown` with a 1 MB cap, which rejected every PDF upload with a generic `500`; it now accepts `application/pdf` too, up to 5 MB (a rendered diet is ~250 KB with fonts and logo embedded). Storage policies restrict each user to their own folder, mirroring the `created_by = auth.uid()` RLS on the tables. Links are signed on demand; never use `getPublicUrl()` — these are health data. Migrations live in `supabase/migrations/`.

### Folder Layout

```
app/
  api/              # Route handlers — the only way the client reaches the server
    transcribe/
    process-consultation/
    diet-preview/     # diet_md -> branded HTML (no Chromium)
    diet-document/    # PUT: rewrite diet_md
    diet-pdf/         # render + store + signed URL (loads Chromium)
    assistant/        # tool-use loop (NDJSON) + confirm/ (executes a confirmed write)
    upload-diet/
  dashboard/        # Main authenticated pages
  login/            # Auth page
  diets/            # Audio + AI consultation flow
  asistente/        # Assistant: chat + voice over the domain tools
lib/                # Repo root, NOT under src/ — no @/ alias
  ai/openai.ts      # Shared OpenAI client (transcription)
  ai/anthropic.ts   # Shared Anthropic client (generation + extraction)
  supabase/         # client.ts (browser) + server.ts (SSR)
src/
  components/
    ui/             # shadcn/ui primitives (do not edit manually — use CLI)
    layout/         # App shell: sidebar, login form, theme toggle
    audio/          # Audio recorder + transcription display
    assistant/      # Assistant thread, input and the confirmation card for a proposed write
    diets/          # Preview + Modificar + Aprobar of the generated document
    patients/       # Patient picker (keyed by id, shows contact to tell namesakes apart), diet comparison, portions chart
    calendar/       # Calendar client component
  services/         # Business logic: transcription, diet generation, extraction, calendar
  models/           # TypeScript types (audio, calendar, dashboard, extraction, diet document)
  constants/        # TanStack Table column definitions, example diets, magic numbers
    diet-pdf/       # Markdown contract + brand tokens, logo and fonts as data URIs
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
