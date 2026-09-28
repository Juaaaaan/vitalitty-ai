-- Weight measured at each consultation, so the patient's weight history
-- survives: patients.weight keeps only the latest known value and is
-- overwritten on every consultation.
alter table public.patient_consultations
  add column weight numeric;
