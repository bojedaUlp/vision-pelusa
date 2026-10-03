-- Protected previews (step 1 of 2). Apply BEFORE deploying the code that uses thumbnail_url.
-- Safe to run more than once. Does not touch purchases, purchase_items or download_access.
--
--   ORIGINAL  → bucket "photos"   (made private in step 2) · photos.image_url (unchanged meaning)
--   PREVIEW   → bucket "previews" (public, watermarked)      · photos.watermark_url
--   THUMBNAIL → bucket "previews" (public, watermarked)      · photos.thumbnail_url (new)

begin;

alter table public.photos add column if not exists thumbnail_url text;

-- Public bucket for watermarked previews/thumbnails only (JPEG, ≤ 5 MB each).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('previews', 'previews', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only admins write previews (public read comes from the bucket being public).
drop policy if exists "previews_admin_insert" on storage.objects;
create policy "previews_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'previews' and public.is_admin());

drop policy if exists "previews_admin_delete" on storage.objects;
create policy "previews_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'previews' and public.is_admin());

-- Admins keep uploading and reading originals once "photos" is private
-- (reading is needed to generate previews for photos uploaded before this change).
drop policy if exists "originals_admin_insert" on storage.objects;
create policy "originals_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin());

drop policy if exists "originals_admin_read" on storage.objects;
create policy "originals_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_admin());

drop policy if exists "originals_admin_delete" on storage.objects;
create policy "originals_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

-- The admin backfill updates watermark_url / thumbnail_url of existing photos.
drop policy if exists "photos_admin_update" on public.photos;
create policy "photos_admin_update" on public.photos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
