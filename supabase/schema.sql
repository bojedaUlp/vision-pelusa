-- =================================================================================================
-- Visión Pelusa — complete schema for a NEW, EMPTY Supabase project (database + auth only).
-- Photos live in Cloudflare R2, not in Supabase Storage. Consolidates migrations/2026100x and the
-- photo deletion work. Run once in the SQL editor of the new project. No demo data, no history.
--
--   R2 "vision-pelusa-originals" (private, Worker binding only) → photos.original_key
--   R2 "vision-pelusa-media"     (public, watermarked only)     → photos.watermark_url / thumbnail_url,
--                                                                  matches.hero_url
-- Lifecycle (rows are never DELETEd, purchase history always survives):
--   photos.status  uploading → active → pending_deletion → deleted
--   matches.status draft | published | archived | deleted
-- =================================================================================================

begin;

create extension if not exists pgcrypto;

-- Profiles / admin ------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, is_admin) values (new.id, new.email, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;

-- Albums ------------------------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  venue text not null,
  played_at timestamptz not null,
  cover_url text,
  hero_url text,
  hero_bytes bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'deleted')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger matches_updated_at before update on public.matches
for each row execute function public.update_updated_at();

-- Photos ------------------------------------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  title text not null,
  sort_order integer not null default 0,
  price integer not null default 1500,
  original_key text,            -- private R2 key, never exposed publicly
  watermark_url text,           -- public watermarked preview
  thumbnail_url text,           -- public watermarked thumbnail
  original_bytes bigint not null default 0,
  preview_bytes bigint not null default 0,
  thumb_bytes bigint not null default 0,
  status text not null default 'uploading'
    check (status in ('uploading', 'active', 'pending_deletion', 'deleted')),
  is_published boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index photos_match_id_status_idx on public.photos (match_id, status);

-- Purchases ---------------------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_email text not null,
  buyer_phone text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  total_amount integer not null default 0,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz,       -- Mercado Pago preference expiration (null = no expiration)
  mercado_pago_payment_id text unique,
  mercado_pago_preference_id text
);

create index purchases_buyer_email_lower_idx on public.purchases (lower(buyer_email));

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete restrict,
  quantity integer not null default 1,
  unit_price integer not null,
  created_at timestamptz not null default now()
);

create index purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index purchase_items_photo_id_idx on public.purchase_items (photo_id);
create unique index purchase_items_purchase_photo_key on public.purchase_items (purchase_id, photo_id);

create table public.download_access (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete restrict,
  download_url text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index download_access_purchase_photo_key on public.download_access (purchase_id, photo_id);

-- Purchase guard: only active, published photos of published albums can enter a purchase.
-- FOR SHARE serializes with admin_prepare_photo_deletion (FOR UPDATE).
create or replace function public.purchase_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_photo_status text;
  v_published boolean;
  v_match_status text;
begin
  if new.photo_id is null then
    return new;
  end if;

  select p.status, p.is_published, m.status into v_photo_status, v_published, v_match_status
  from public.photos p join public.matches m on m.id = p.match_id
  where p.id = new.photo_id
  for share of p;

  if not found or v_photo_status <> 'active' or v_published is not true
     or v_match_status is distinct from 'published' then
    raise exception 'PHOTO_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger purchase_items_guard
before insert or update of photo_id on public.purchase_items
for each row execute function public.purchase_items_guard();

-- Storage budget ----------------------------------------------------------------------------------
-- Bytes counted against the R2 budget: every photo not deleted (including uploads in progress,
-- which are reserved before any byte is sent) plus album heroes.
create or replace function public.admin_storage_usage()
returns table (used_bytes bigint, photos bigint, albums bigint, incomplete_uploads bigint)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(original_bytes + preview_bytes + thumb_bytes) from public.photos where status <> 'deleted'), 0)
      + coalesce((select sum(hero_bytes) from public.matches where status <> 'deleted'), 0),
    (select count(*) from public.photos where status = 'active'),
    (select count(*) from public.matches where status <> 'deleted'),
    (select count(*) from public.photos where status = 'uploading');
$$;

-- Reserves space and creates the photo row ('uploading', unpublished) BEFORE the files are sent.
-- The advisory lock serializes concurrent uploads so two batches can never overshoot the budget.
create or replace function public.admin_reserve_photo_upload(
  p_match_id uuid, p_title text, p_sort_order integer, p_price integer,
  p_original_bytes bigint, p_preview_bytes bigint, p_thumb_bytes bigint, p_budget_bytes bigint
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_used bigint;
  v_id uuid := gen_random_uuid();
  v_status text;
begin
  if p_original_bytes <= 0 or p_preview_bytes <= 0 or p_thumb_bytes <= 0 then
    raise exception 'INVALID_SIZE' using errcode = 'P0001';
  end if;

  select status into v_status from public.matches where id = p_match_id;
  if v_status is null or v_status = 'deleted' then
    raise exception 'ALBUM_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('vision_pelusa_storage_budget'));
  select used_bytes into v_used from public.admin_storage_usage();
  if v_used + p_original_bytes + p_preview_bytes + p_thumb_bytes > p_budget_bytes then
    raise exception 'STORAGE_BUDGET_EXCEEDED' using errcode = 'P0001';
  end if;

  insert into public.photos (id, match_id, title, sort_order, price, original_key,
                             original_bytes, preview_bytes, thumb_bytes, status, is_published)
  values (v_id, p_match_id, p_title, p_sort_order, p_price, p_match_id || '/' || v_id,
          p_original_bytes, p_preview_bytes, p_thumb_bytes, 'uploading', false);
  return v_id;
end;
$$;

-- Deletion ----------------------------------------------------------------------------------------
-- Outcomes:
--   already_deleted
--   download_active  a paid purchase still has download rights (or rights not granted yet)
--   pending_payment  a purchase is 'pending'/'failed': Mercado Pago may still credit it.
--                    The server reconciles these with Mercado Pago before deleting; only
--                    purchases proven unpayable become 'expired' and stop protecting.
--   eligible         files can be removed (sold photos too, once every download expired)
-- With p_dry_run = false eligible photos are locked and moved to 'pending_deletion' (unpublished).
create or replace function public.admin_prepare_photo_deletion(p_photo_ids uuid[], p_dry_run boolean default true)
returns table (photo_id uuid, match_id uuid, outcome text, sold boolean, original_key text,
               watermark_url text, thumbnail_url text, bytes bigint)
language plpgsql security definer set search_path = public as $$
declare
  rec record;
begin
  for rec in
    select p.* from public.photos p where p.id = any(p_photo_ids) order by p.id
  loop
    if not p_dry_run then
      perform 1 from public.photos where id = rec.id for update;
    end if;

    sold := exists (
      select 1 from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
      where pi.photo_id = rec.id and pu.status = 'paid');

    if rec.status = 'deleted' then
      outcome := 'already_deleted';
    elsif exists (
      select 1 from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      left join public.download_access da on da.purchase_id = pi.purchase_id and da.photo_id = pi.photo_id
      where pi.photo_id = rec.id and pu.status = 'paid'
        and (da.id is null or da.expires_at is null or da.expires_at > now())
    ) then
      outcome := 'download_active';
    elsif exists (
      select 1 from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
      where pi.photo_id = rec.id and pu.status in ('pending', 'failed')
    ) then
      outcome := 'pending_payment';
    else
      outcome := 'eligible';
      if not p_dry_run and rec.status <> 'pending_deletion' then
        update public.photos set status = 'pending_deletion', is_published = false where id = rec.id;
      end if;
    end if;

    photo_id := rec.id;
    match_id := rec.match_id;
    original_key := rec.original_key;
    watermark_url := rec.watermark_url;
    thumbnail_url := rec.thumbnail_url;
    bytes := rec.original_bytes + rec.preview_bytes + rec.thumb_bytes;
    return next;
  end loop;
end;
$$;

-- Called only after the files were removed from R2. Keeps the row as history.
create or replace function public.admin_finalize_photo_deletion(p_photo_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.photos
     set status = 'deleted', deleted_at = now(), is_published = false,
         original_key = null, watermark_url = null, thumbnail_url = null,
         original_bytes = 0, preview_bytes = 0, thumb_bytes = 0
   where id = any(p_photo_ids) and status = 'pending_deletion';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Privileges: admin RPCs only through the server (service role), never from the browser.
revoke all on function public.admin_storage_usage() from public, anon, authenticated;
revoke all on function public.admin_reserve_photo_upload(uuid, text, integer, integer, bigint, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.admin_prepare_photo_deletion(uuid[], boolean) from public, anon, authenticated;
revoke all on function public.admin_finalize_photo_deletion(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_storage_usage() to service_role;
grant execute on function public.admin_reserve_photo_upload(uuid, text, integer, integer, bigint, bigint, bigint, bigint) to service_role;
grant execute on function public.admin_prepare_photo_deletion(uuid[], boolean) to service_role;
grant execute on function public.admin_finalize_photo_deletion(uuid[]) to service_role;

-- Row Level Security ------------------------------------------------------------------------------
-- Writes to photos, purchases, purchase_items and download_access only happen server-side with the
-- service role (bypasses RLS). The browser (anon key) reads public data; the admin session can
-- read everything and create/edit albums.
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.photos enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.download_access enable row level security;

-- No UPDATE policy on profiles on purpose: a user must never be able to set is_admin.
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);

create policy "matches_select_public" on public.matches for select using (status = 'published');
create policy "matches_admin_select" on public.matches for select to authenticated using (public.is_admin());
create policy "matches_admin_insert" on public.matches for insert to authenticated with check (public.is_admin());
create policy "matches_admin_update" on public.matches for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and status <> 'deleted');

create policy "photos_select_public" on public.photos for select using (
  is_published = true and status = 'active'
  and exists (select 1 from public.matches m where m.id = photos.match_id and m.status = 'published'));
create policy "photos_admin_select" on public.photos for select to authenticated using (public.is_admin());

create policy "purchases_select_admin" on public.purchases for select to authenticated using (public.is_admin());
create policy "purchase_items_select_admin" on public.purchase_items for select to authenticated using (public.is_admin());
create policy "download_access_select_admin" on public.download_access for select to authenticated using (public.is_admin());

-- The private original location is never readable from the browser (column-level grant; a
-- column REVOKE alone would not override Supabase's default table-level grant).
revoke select on public.photos from anon, authenticated;
grant select (id, match_id, title, sort_order, price, watermark_url, thumbnail_url, status, is_published,
              created_at, deleted_at) on public.photos to anon, authenticated;

commit;

-- After running: create the admin user (see supabase/README.md), then
--   update public.profiles set is_admin = true where email = '<admin email>';
