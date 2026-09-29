-- The diets bucket now also holds the branded PDF of each consultation, next to
-- its .md. Ownership is unchanged: the per-user folder policies created with the
-- bucket already cover both files, so no policy is added here.
--
-- Two limits did need widening, and without them every upload failed with a
-- generic 500 ("No se pudo guardar el PDF"):
--   * allowed_mime_types only listed text/markdown, so application/pdf was
--     rejected outright.
--   * file_size_limit was 1 MB. A rendered diet is ~250 KB with its fonts and
--     logo embedded, which fits, but leaves no room for a long plan.
update storage.buckets
set allowed_mime_types = array['text/markdown', 'application/pdf'],
    file_size_limit = 5242880
where id = 'diets';
