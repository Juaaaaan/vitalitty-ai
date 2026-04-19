# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Architecture

**Stack:** Next.js App Router + React 19 + TypeScript 5 + Tailwind CSS v4 + Supabase + OpenAI

### Routing & Pages

- `/` → redirects to `/dashboard`
- `/login` → Supabase email/password auth
- `/dashboard` → Patient list with TanStack React Table CRUD
- `/dashboard/calendar` → Monthly appointments calendar (async server component)
- `/dashboard/patient/[id]` → Dynamic patient detail
- `/diets` → Audio recording → transcription → AI extraction → save consultation

### Key Architectural Patterns

**Server vs Client split:**

- Server components handle data-heavy pages (calendar, patient detail)
- Client components (`"use client"`) handle interactivity (audio recorder, forms, table)
- Server Actions (`"use server"`) in `app/actions/` for audio transcription and consultation processing — body size limit is 10mb (configured in `next.config.ts`) to accommodate audio files

**AI pipeline in `/diets`:**

1. Browser `MediaRecorder` captures audio (webm)
2. `transcribeAction()` sends audio to OpenAI Whisper → transcript text
3. `processConsultation()` sends transcript to GPT-4o with strict JSON schema → extracts `PatientData` + `ConsultationData` structs
4. Saves structured data to Supabase

**Authentication:** Supabase Auth with SSR session refresh in `middleware.ts`. Client-side redirect to `/login` when unauthenticated.

**Audio storage:** Uploaded to Supabase Storage bucket `"audios"` before transcription.

### Folder Layout

```
app/
  actions/          # Server Actions (transcribe, save-consultation)
  dashboard/        # Main authenticated pages
  login/            # Auth page
  diets/            # Audio + AI consultation flow
src/
  components/
    ui/             # shadcn/ui primitives (do not edit manually — use CLI)
    layout/         # App shell: sidebar, login form, theme toggle
    audio/          # Audio recorder + transcription display
    calendar/       # Calendar client component
  services/         # Business logic: transcription, GPT-4o extraction, calendar
  models/           # TypeScript interfaces (Patient, Consultation, Appointment)
  constants/        # TanStack Table column definitions, magic numbers
  hooks/            # use-mobile.ts
  lib/utils.ts      # cn() helper (clsx + tailwind-merge)
middleware.ts       # Supabase SSR auth
```

### Import Alias

`@/*` maps to `src/` (configured in `tsconfig.json` with `baseUrl: "src"`).

### UI Components

shadcn/ui with **new-york** style. Add new components via:

```bash
npx shadcn@latest add <component>
```

Never edit files in `src/components/ui/` by hand — they're generated.

### Testing

Vitest with jsdom environment. Tests live alongside pages in `__tests__/` subdirectories. Coverage is collected for `app/**/*.tsx` and `src/**/*.tsx`.
