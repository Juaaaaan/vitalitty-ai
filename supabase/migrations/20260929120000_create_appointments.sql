-- Real appointments. The calendar used to render a hardcoded mock, so there was
-- no way to answer "who has a review this week" from actual data.
--
-- Ownership mirrors patients / patient_consultations: created_by = auth.uid(),
-- enforced by RLS. A `bloqueo` blocks time without a patient, so patient_id is
-- nullable; every other type points at one of the user's own patients.
create table public.appointments (
  id uuid primary key default extensions.uuid_generate_v4(),
  patient_id uuid references public.patients (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  type text not null check (
    type in ('seguimiento', 'primera_cita', 'revision', 'urgente', 'bloqueo')
  ),
  status text not null default 'pending' check (
    status in ('pending', 'completed', 'cancelled')
  ),
  notes text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint appointments_ends_after_start check (end_time > start_time),
  constraint appointments_patient_required_unless_block check (
    type = 'bloqueo' or patient_id is not null
  )
);

-- Every read is "my appointments in this time range", in that order.
create index appointments_created_by_start_time_idx
  on public.appointments (created_by, start_time);

alter table public.appointments enable row level security;

create policy "Users can read their own appointments"
  on public.appointments for select to authenticated
  using (created_by = auth.uid());

create policy "Users can insert their own appointments"
  on public.appointments for insert to authenticated
  with check (created_by = auth.uid());

create policy "Users can update their own appointments"
  on public.appointments for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Users can delete their own appointments"
  on public.appointments for delete to authenticated
  using (created_by = auth.uid());
