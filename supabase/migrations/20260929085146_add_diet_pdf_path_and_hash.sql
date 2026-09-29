-- Branded PDF of this row's diet, rendered from diet_md.
--   pdf_path:        path of the file inside the private "diets" bucket, next
--                    to the .md of the same consultation. A path, never a URL:
--                    links are signed on demand. Same convention as the legacy
--                    documento_url column.
--   pdf_source_hash: hash of the diet_md the PDF was rendered from. The stored
--                    PDF is reused while this matches the current diet_md; any
--                    edit to the document invalidates it by construction.
-- Both null for existing rows: diets written before the markdown contract have
-- no PDF and are not backfilled.
alter table public.patient_consultations
  add column pdf_path text,
  add column pdf_source_hash text;
