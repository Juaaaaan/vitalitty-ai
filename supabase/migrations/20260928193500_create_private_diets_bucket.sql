-- Private bucket for diet markdown documents. Files live under
-- {auth.uid()}/{patient_id}/{consultation_id}.md, mirroring the
-- created_by = auth.uid() ownership model of patients / patient_consultations.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diets', 'diets', false, 1048576, array['text/markdown']);

create policy "Users can read their own diets"
  on storage.objects for select to authenticated
  using (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload their own diets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own diets"
  on storage.objects for update to authenticated
  using (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own diets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text);
