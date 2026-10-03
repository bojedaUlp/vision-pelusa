create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy if not exists "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

create policy if not exists "profiles_update_own" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

create policy if not exists "profiles_admin_select" on public.profiles
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  venue text not null,
  played_at timestamptz not null,
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  price integer not null default 1500,
  image_url text,
  watermark_url text,
  thumbnail_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.price_tiers (
  id uuid primary key default gen_random_uuid(),
  max_count integer not null,
  amount integer not null,
  sort_order integer not null default 0
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_email text not null,
  buyer_phone text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  total_amount integer not null default 0,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  mercado_pago_payment_id text unique,
  mercado_pago_preference_id text
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete set null,
  quantity integer not null default 1,
  unit_price integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.download_access (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete set null,
  download_url text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;
alter table public.photos enable row level security;
alter table public.price_tiers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.download_access enable row level security;

create policy if not exists "matches_select_public" on public.matches for select using (true);
create policy if not exists "photos_select_public" on public.photos for select using (true);
create policy if not exists "price_tiers_select_public" on public.price_tiers for select using (true);
-- Purchase data: no public access. Writes use the service role; reads are admin-only
-- (buyers go through the API routes). See migrations/20261002_purchase_flow.sql.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$;

create policy "purchases_select_admin" on public.purchases for select using (public.is_admin());
create policy "purchase_items_select_admin" on public.purchase_items for select using (public.is_admin());
create policy "download_access_select_admin" on public.download_access for select using (public.is_admin());

create index if not exists matches_slug_idx on public.matches(slug);
create index if not exists photos_match_id_idx on public.photos(match_id);
create index if not exists purchases_buyer_email_idx on public.purchases(buyer_email);
create index if not exists purchase_items_purchase_id_idx on public.purchase_items(purchase_id);
create unique index if not exists purchase_items_purchase_photo_key on public.purchase_items(purchase_id, photo_id);
create unique index if not exists download_access_purchase_photo_key on public.download_access(purchase_id, photo_id);
create index if not exists purchases_buyer_email_lower_idx on public.purchases(lower(buyer_email));

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger matches_updated_at
before update on public.matches
for each row
execute function public.update_updated_at();
