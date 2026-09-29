-- Light projections of each diet document, computed once and cached:
--   diet_portions: portions per food group of this row's diet (charts, deltas)
--   diet_changes:  comparison with the previous diet version of the same
--                  patient (foods in/out and a "what changed and why" summary)
-- Both are derived from diet_md, which stays the source of truth.
alter table public.patient_consultations
  add column diet_portions jsonb,
  add column diet_changes jsonb;
