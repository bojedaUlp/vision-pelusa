-- Post-payment flow: real photo ids, idempotent Mercado Pago confirmation, private purchase data.
-- Safe to run more than once.

begin;

-- 1. purchases: link to Mercado Pago. UNIQUE payment id = idempotency for repeated webhooks.
alter table public.purchases add column if not exists mercado_pago_payment_id text;
alter table public.purchases add column if not exists mercado_pago_preference_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchases_mercado_pago_payment_id_key'
  ) then
    alter table public.purchases
      add constraint purchases_mercado_pago_payment_id_key unique (mercado_pago_payment_id);
  end if;
end $$;

create index if not exists purchases_buyer_email_lower_idx on public.purchases (lower(buyer_email));

-- 2. purchase_items: one row per purchased photo.
create unique index if not exists purchase_items_purchase_photo_key
  on public.purchase_items (purchase_id, photo_id);

-- 3. download_access: store the authorization (purchase + photo + expiry), not a URL.
alter table public.download_access alter column download_url drop not null;

create unique index if not exists download_access_purchase_photo_key
  on public.download_access (purchase_id, photo_id);

-- 4. RLS: writes happen only with the service role (server). Reads of purchase data are
--    restricted to admins; buyers read through the API routes, which use the service role.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;

drop policy if exists "purchases_select_public" on public.purchases;
drop policy if exists "purchase_items_select_public" on public.purchase_items;
drop policy if exists "download_access_select_public" on public.download_access;

drop policy if exists "purchases_select_admin" on public.purchases;
create policy "purchases_select_admin" on public.purchases for select using (public.is_admin());

drop policy if exists "purchase_items_select_admin" on public.purchase_items;
create policy "purchase_items_select_admin" on public.purchase_items for select using (public.is_admin());

drop policy if exists "download_access_select_admin" on public.download_access;
create policy "download_access_select_admin" on public.download_access for select using (public.is_admin());

commit;

-- Optional, after reviewing: rows written by the old webhook carry photo_id = null and grant nothing.
-- select * from public.purchase_items where photo_id is null;
-- select * from public.download_access where photo_id is null;
