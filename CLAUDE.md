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
3. **React 19 + App Router:** never batch several `setState` calls in one handler without `useTransition`. It freezes the UI with no error and no stack trace.
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

The repo has not reached the target yet. Known deltas, so nobody documents them as done:

- `src/services/extraction-service.ts` still uses `gpt-4o` for both extraction and diet generation, and still fills a `{{placeholder}}` markdown template. Migrating it to Claude + single-pass generation is a pending change.
- `@anthropic-ai/sdk` is not a dependency yet. Only `openai` is installed.
- `app/actions/` still holds Server Actions (`save-consultation`, `upload-diet`). They predate rule 1 and are migrated as part of the generation change, not opportunistically.

**Closed:** transcription reached the target in change `2026-09-28-switch-transcription-to-gpt4o`. `gpt-4o-transcribe`, `/api/transcribe` delegating to `transcribeAudio()`, 10 MB input cap → `413`. Its behaviour contract lives in `openspec/specs/audio-transcription/spec.md`.

### Routing & Pages

- `/` → client-side redirect to `/dashboard`
- `/login` → Supabase email/password auth
- `/dashboard` → Patient list with TanStack React Table CRUD
- `/dashboard/calendar` → Monthly appointments calendar (async server component)
- `/dashboard/patient/[id]` → Dynamic patient detail
- `/diets` → Audio recording → transcription → diet generation → save consultation

### Route handlers

- `POST /api/transcribe` — multipart `audio` file → `{ text }`. Thin layer over `transcribeAudio()`: model, language and the 10 MB input cap live in the service, not here. `413` when the audio exceeds the cap, `400` with no audio, `500` on provider failure — every error body carries `error`, because the client reads it before looking at the status.
- `POST /api/process-consultation` — `{ transcription, existingPatientId? }` → runs extraction and diet generation, persists to Supabase

### Server vs Client split

- Server components handle data-heavy pages (calendar, patient detail)
- Client components (`"use client"`) handle interactivity (audio recorder, forms, table)
- Anything touching an API key or the service-role Supabase client stays server-side, behind a route handler

**Authentication:** Supabase Auth with SSR session refresh in `middleware.ts`. Client-side redirect to `/login` when unauthenticated.

**Audio storage:** Supabase Storage bucket `"audios"`.

### Folder Layout

```
app/
  api/              # Route handlers — the only way the client reaches the server
    transcribe/
    process-consultation/
  actions/          # Server Actions (legacy — see "Current state vs target")
  dashboard/        # Main authenticated pages
  login/            # Auth page
  diets/            # Audio + AI consultation flow
lib/                # Repo root, NOT under src/ — no @/ alias
  ai/openai.ts      # Shared OpenAI client
  supabase/         # client.ts (browser) + server.ts (SSR)
src/
  components/
    ui/             # shadcn/ui primitives (do not edit manually — use CLI)
    layout/         # App shell: sidebar, login form, theme toggle
    audio/          # Audio recorder + transcription display
    calendar/       # Calendar client component
  services/         # Business logic: transcription, extraction/generation, calendar
  models/           # TypeScript types (audio, calendar, dashboard, extraction)
  constants/        # TanStack Table column definitions, magic numbers
  hooks/            # use-mobile.ts
  lib/utils.ts      # cn() helper (clsx + tailwind-merge)
middleware.ts       # Supabase SSR auth
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
