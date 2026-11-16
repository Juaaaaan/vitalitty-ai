-- The "Cerebro": versioned prompts and versioned knowledge documents that the
-- diet generation reads before calling the model.
--
-- Same shape for both: a header row holding the stable identity and a pointer
-- to its active version, plus an insert-only versions table. A version is never
-- updated or deleted, so activating one is moving a pointer and rolling back
-- costs nothing. That is enforced here, not by convention: the versions tables
-- get select/insert policies and no update/delete policy at all.

create type public.knowledge_document_type as enum (
  'suplementacion',
  'recetario',
  'paper',
  'protocolo',
  'otro'
);

-- Prompts ---------------------------------------------------------------------

-- `tipo` is free text on purpose: the system grows functions over time
-- (generacion_dieta, extraccion_campos, validacion_alergias, ...) and a new one
-- should not need a migration. The consuming code asks by type, never by id.
create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  nombre text not null,
  tipo text not null,
  version_activa_id uuid,
  version_activada_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prompts_slug_not_blank check (length(btrim(slug)) > 0),
  constraint prompts_created_by_slug_key unique (created_by, slug)
);

create table public.prompt_versiones (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  version integer not null,
  contenido text not null,
  nota_cambio text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint prompt_versiones_contenido_not_blank check (length(btrim(contenido)) > 0),
  constraint prompt_versiones_prompt_version_key unique (prompt_id, version)
);

-- Added after the versions table exists: the two tables point at each other.
alter table public.prompts
  add constraint prompts_version_activa_id_fkey
  foreign key (version_activa_id)
  references public.prompt_versiones (id)
  on delete set null;

create index prompts_created_by_tipo_idx on public.prompts (created_by, tipo);
create index prompt_versiones_prompt_id_version_idx
  on public.prompt_versiones (prompt_id, version desc);

-- Knowledge documents ---------------------------------------------------------

-- `siempre_incluir` marks a document that enters every generation regardless of
-- the patient — the Editor protocol, for instance. Everything else is selected
-- by crossing `tipo` and `tags` with the patient profile.
create table public.documentos_conocimiento (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  titulo text not null,
  tipo public.knowledge_document_type not null default 'otro',
  tags text[] not null default '{}',
  siempre_incluir boolean not null default false,
  version_activa_id uuid,
  version_activada_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documentos_conocimiento_slug_not_blank check (length(btrim(slug)) > 0),
  constraint documentos_conocimiento_created_by_slug_key unique (created_by, slug)
);

create table public.documento_versiones (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos_conocimiento (id) on delete cascade,
  version integer not null,
  contenido_md text not null,
  nota_cambio text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint documento_versiones_contenido_not_blank check (length(btrim(contenido_md)) > 0),
  constraint documento_versiones_documento_version_key unique (documento_id, version)
);

alter table public.documentos_conocimiento
  add constraint documentos_conocimiento_version_activa_id_fkey
  foreign key (version_activa_id)
  references public.documento_versiones (id)
  on delete set null;

create index documentos_conocimiento_created_by_tipo_idx
  on public.documentos_conocimiento (created_by, tipo);
-- The retrieval filters by tag overlap, which needs a GIN index to stay a
-- single cheap query as the knowledge base grows.
create index documentos_conocimiento_tags_idx
  on public.documentos_conocimiento using gin (tags);
create index documento_versiones_documento_id_version_idx
  on public.documento_versiones (documento_id, version desc);

-- Version numbering -----------------------------------------------------------

-- Assigns N+1 per parent on insert. Same pattern as assign_diet_version: the
-- advisory lock serialises concurrent inserts for the same parent, so two tabs
-- saving at once cannot both read the same max and collide on the unique index.
create or replace function public.assign_prompt_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version is null then
    perform pg_advisory_xact_lock(hashtext('prompt_versiones:' || new.prompt_id::text));
    select coalesce(max(version), 0) + 1
      into new.version
      from public.prompt_versiones
      where prompt_id = new.prompt_id;
  end if;
  return new;
end;
$$;

create trigger assign_prompt_version
  before insert on public.prompt_versiones
  for each row execute function public.assign_prompt_version();

create or replace function public.assign_documento_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version is null then
    perform pg_advisory_xact_lock(hashtext('documento_versiones:' || new.documento_id::text));
    select coalesce(max(version), 0) + 1
      into new.version
      from public.documento_versiones
      where documento_id = new.documento_id;
  end if;
  return new;
end;
$$;

create trigger assign_documento_version
  before insert on public.documento_versiones
  for each row execute function public.assign_documento_version();

-- Row level security ----------------------------------------------------------

-- Each nutritionist sees only their own Cerebro. This is what keeps one user's
-- knowledge out of another user's generation: the retrieval runs with the
-- session client, so the isolation is the database's, not the prompt's.

alter table public.prompts enable row level security;
alter table public.prompt_versiones enable row level security;
alter table public.documentos_conocimiento enable row level security;
alter table public.documento_versiones enable row level security;

create policy "Users can read own prompts"
  on public.prompts for select
  using (created_by = auth.uid());

create policy "Users can create own prompts"
  on public.prompts for insert
  with check (created_by = auth.uid());

-- The header is mutable: it holds the active-version pointer and the readable
-- name. The content it points at is not.
create policy "Users can update own prompts"
  on public.prompts for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Users can read own prompt versions"
  on public.prompt_versiones for select
  using (created_by = auth.uid());

create policy "Users can create own prompt versions"
  on public.prompt_versiones for insert
  with check (created_by = auth.uid());

-- No update and no delete policy for prompt_versiones, on purpose: with RLS
-- enabled, an operation without a policy is denied. A created version is final.

create policy "Users can read own knowledge documents"
  on public.documentos_conocimiento for select
  using (created_by = auth.uid());

create policy "Users can create own knowledge documents"
  on public.documentos_conocimiento for insert
  with check (created_by = auth.uid());

create policy "Users can update own knowledge documents"
  on public.documentos_conocimiento for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Users can read own knowledge document versions"
  on public.documento_versiones for select
  using (created_by = auth.uid());

create policy "Users can create own knowledge document versions"
  on public.documento_versiones for insert
  with check (created_by = auth.uid());

-- Same as above: no update/delete policy for documento_versiones.
