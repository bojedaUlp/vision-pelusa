-- Home hero image per gallery. Apply BEFORE deploying the code that reads matches.hero_url.
-- Safe to run more than once. Does not touch photos, the "photos" bucket, purchases,
-- purchase_items or download_access.
--
--   HERO → bucket "previews" (public) · matches.hero_url
--   One promotional image per gallery, generated in the admin from a photo the admin picks:
--   ≤1920px JPEG, discreet corner mark only.

begin;

alter table public.matches add column if not exists hero_url text;

-- The admin saves hero_url (and edits galleries) with its own session.
drop policy if exists "matches_admin_update" on public.matches;
create policy "matches_admin_update" on public.matches
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
