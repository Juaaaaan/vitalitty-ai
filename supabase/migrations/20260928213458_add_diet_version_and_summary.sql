-- Per-patient diet version and a short consultation summary used as the
-- patient's persistent memory in future diet generations.
alter table public.patient_consultations
  add column diet_version integer,
  add column consultation_summary text;

-- Backfill: number the existing diets of each patient by creation order.
with numbered as (
  select id,
         row_number() over (partition by patient_id order by created_at, id) as version
  from public.patient_consultations
  where diet_md is not null
)
update public.patient_consultations pc
set diet_version = numbered.version
from numbered
where pc.id = numbered.id;

-- Two consultations of the same patient never share a version.
create unique index patient_consultations_patient_diet_version_key
  on public.patient_consultations (patient_id, diet_version)
  where diet_version is not null;

-- Assigns N+1 on insert. The advisory lock serialises concurrent inserts for
-- the same patient, so two tabs saving at once cannot both read the same max.
create or replace function public.assign_diet_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.diet_md is not null and new.diet_version is null and new.patient_id is not null then
    perform pg_advisory_xact_lock(hashtext(new.patient_id::text));
    select coalesce(max(diet_version), 0) + 1
      into new.diet_version
      from public.patient_consultations
      where patient_id = new.patient_id;
  end if;
  return new;
end;
$$;

create trigger assign_diet_version
  before insert on public.patient_consultations
  for each row execute function public.assign_diet_version();
