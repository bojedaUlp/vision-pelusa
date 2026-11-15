-- Tests for supabase/schema.sql. Run by run-db-tests.sh in a throwaway Postgres.
\set ON_ERROR_STOP 1

-- Fixtures ---------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-4000-8000-0000000000b2', 'user@test.local');
-- handle_new_user created both profiles (is_admin = false); promote the admin like the README says.
update public.profiles set is_admin = true where email = 'admin@test.local';

insert into public.matches (id, slug, title, venue, played_at, status) values
  ('10000000-0000-4000-8000-000000000001', 'm1', 'Album 1', 'X', now(), 'published'),
  ('10000000-0000-4000-8000-000000000002', 'm2', 'Album 2', 'X', now(), 'archived'),
  ('10000000-0000-4000-8000-000000000003', 'm3', 'Album 3', 'X', now(), 'published'),
  ('10000000-0000-4000-8000-000000000004', 'm4', 'Draft', 'X', now(), 'draft');

insert into public.photos (id, match_id, title, original_key, status, is_published, original_bytes, preview_bytes, thumb_bytes) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'unsold', 'k1', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'sold, download active', 'k2', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'pending', 'k3', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'failed', 'k4', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'archived album', 'k5', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', 'race', 'k6', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', 'race2', 'k7', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000004', 'draft album', 'k8', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'sold, download expired', 'k9', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'expired purchase', 'k10', 'active', true, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'uploading', 'k11', 'uploading', false, 100, 10, 1),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 'paid, access not granted yet', 'k12', 'active', true, 100, 10, 1);

insert into public.purchases (id, buyer_email, status, total_amount) values
  ('30000000-0000-4000-8000-000000000002', 'b@test.local', 'paid', 100),
  ('30000000-0000-4000-8000-000000000003', 'b@test.local', 'pending', 100),
  ('30000000-0000-4000-8000-000000000004', 'b@test.local', 'failed', 100),
  ('30000000-0000-4000-8000-000000000009', 'b@test.local', 'paid', 100),
  ('30000000-0000-4000-8000-000000000010', 'b@test.local', 'expired', 100),
  ('30000000-0000-4000-8000-000000000012', 'b@test.local', 'paid', 100);
insert into public.purchase_items (purchase_id, photo_id, unit_price) values
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 100),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 100),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 100),
  ('30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009', 100),
  ('30000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010', 100),
  ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012', 100);
insert into public.download_access (purchase_id, photo_id, expires_at) values
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', now() + interval '7 days'),
  ('30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009', now() - interval '1 day');

-- 1. Referential integrity ------------------------------------------------------------------------
do $$ begin
  begin
    delete from public.matches where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: deleting an album with photos must be blocked';
  exception when foreign_key_violation then null; end;
  begin
    delete from public.photos where id = '20000000-0000-4000-8000-000000000002';
    raise exception 'FAIL: deleting a purchased photo row must be blocked';
  exception when foreign_key_violation then null; end;
  raise notice 'ok 1 - FK RESTRICT protects albums, photos and purchase history';
end $$;

-- 2. Classification (dry run changes nothing) ----------------------------------------------------
do $$
declare r record; expected jsonb := jsonb_build_object(
  '20000000-0000-4000-8000-000000000001', 'eligible',
  '20000000-0000-4000-8000-000000000002', 'download_active',
  '20000000-0000-4000-8000-000000000003', 'pending_payment',
  '20000000-0000-4000-8000-000000000004', 'pending_payment',
  '20000000-0000-4000-8000-000000000009', 'eligible',
  '20000000-0000-4000-8000-000000000010', 'eligible',
  '20000000-0000-4000-8000-000000000011', 'eligible',
  '20000000-0000-4000-8000-000000000012', 'download_active');
begin
  for r in select * from public.admin_prepare_photo_deletion(
      (select array_agg(key::uuid) from jsonb_object_keys(expected) key), true)
  loop
    if r.outcome <> expected ->> r.photo_id::text then
      raise exception 'FAIL: % expected % got %', r.photo_id, expected ->> r.photo_id::text, r.outcome;
    end if;
    if r.photo_id = '20000000-0000-4000-8000-000000000009' and not r.sold then
      raise exception 'FAIL: sold flag missing';
    end if;
  end loop;
  if exists (select 1 from public.photos where status = 'pending_deletion') then
    raise exception 'FAIL: dry run modified photos';
  end if;
  raise notice 'ok 2 - unsold/expired-download/expired-purchase eligible; active download, unpaid access and pending/failed protected';
end $$;

-- 3. Purchase guard -------------------------------------------------------------------------------
insert into public.purchases (id, buyer_email, status) values ('30000000-0000-4000-8000-000000000099', 'c@test.local', 'pending');
do $$
declare p uuid;
begin
  foreach p in array array['20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000008',
                           '20000000-0000-4000-8000-000000000011']::uuid[] loop
    begin
      insert into public.purchase_items (purchase_id, photo_id, unit_price) values ('30000000-0000-4000-8000-000000000099', p, 1);
      raise exception 'FAIL: photo % was purchasable', p;
    exception when raise_exception then
      if sqlerrm <> 'PHOTO_NOT_AVAILABLE' then raise; end if;
    end;
  end loop;
  raise notice 'ok 3 - archived/draft albums and incomplete uploads accept no purchases';
end $$;

-- 4. Execute: mark → (R2 objects deleted by the API) → finalize; history kept ---------------------
select count(*) from public.admin_prepare_photo_deletion(array['20000000-0000-4000-8000-000000000009',
  '20000000-0000-4000-8000-000000000002']::uuid[], false);
do $$ begin
  if (select status from public.photos where id = '20000000-0000-4000-8000-000000000009') <> 'pending_deletion' then
    raise exception 'FAIL: sold photo with expired downloads not marked';
  end if;
  if (select status from public.photos where id = '20000000-0000-4000-8000-000000000002') <> 'active' then
    raise exception 'FAIL: photo with an active download was marked';
  end if;
  begin
    insert into public.purchase_items (purchase_id, photo_id, unit_price)
    values ('30000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000009', 1);
    raise exception 'FAIL: photo pending deletion was purchasable';
  exception when raise_exception then
    if sqlerrm <> 'PHOTO_NOT_AVAILABLE' then raise; end if;
  end;
  if public.admin_finalize_photo_deletion(array['20000000-0000-4000-8000-000000000009',
       '20000000-0000-4000-8000-000000000002']::uuid[]) <> 1 then
    raise exception 'FAIL: finalize must only touch pending photos';
  end if;
  if exists (select 1 from public.photos where id = '20000000-0000-4000-8000-000000000009'
             and (status <> 'deleted' or original_key is not null or original_bytes <> 0)) then
    raise exception 'FAIL: deleted photo not finalized';
  end if;
  if not exists (select 1 from public.purchase_items where photo_id = '20000000-0000-4000-8000-000000000009')
  or (select status from public.purchases where id = '30000000-0000-4000-8000-000000000009') <> 'paid' then
    raise exception 'FAIL: purchase history was affected';
  end if;
  raise notice 'ok 4 - sold photo with expired download deleted, purchase history kept, active download untouched';
end $$;

-- 5. Idempotency ---------------------------------------------------------------------------------
do $$ begin
  if (select outcome from public.admin_prepare_photo_deletion(array['20000000-0000-4000-8000-000000000009']::uuid[], false))
     <> 'already_deleted' then
    raise exception 'FAIL: re-running on a deleted photo must be a no-op';
  end if;
  if public.admin_finalize_photo_deletion(array['20000000-0000-4000-8000-000000000009']::uuid[]) <> 0 then
    raise exception 'FAIL: finalize twice must be a no-op';
  end if;
  raise notice 'ok 5 - retries do not duplicate effects';
end $$;

-- 6. Storage budget -------------------------------------------------------------------------------
do $$
declare used bigint; new_id uuid;
begin
  select used_bytes into used from public.admin_storage_usage();
  -- 11 photos x 111 bytes are counted (deleted photo excluded, incomplete upload included).
  if used <> 11 * 111 then raise exception 'FAIL: usage % expected %', used, 11 * 111; end if;
  new_id := public.admin_reserve_photo_upload('10000000-0000-4000-8000-000000000003', 'new', 0, 1500, 50, 5, 1, used + 56);
  if (select status from public.photos where id = new_id) <> 'uploading'
  or (select original_key from public.photos where id = new_id) <> '10000000-0000-4000-8000-000000000003/' || new_id then
    raise exception 'FAIL: reservation row not created as uploading with a server-side key';
  end if;
  begin
    perform public.admin_reserve_photo_upload('10000000-0000-4000-8000-000000000003', 'too big', 0, 1500, 1, 1, 1, used + 56);
    raise exception 'FAIL: budget exceeded but reservation accepted';
  exception when raise_exception then
    if sqlerrm <> 'STORAGE_BUDGET_EXCEEDED' then raise; end if;
  end;
  raise notice 'ok 6 - usage counts uploads in progress; reservations beyond the budget are rejected';
end $$;

-- 7. Permissions: admin RPCs only for the service role ---------------------------------------------
do $$ begin
  set local role authenticated;
  begin
    perform public.admin_finalize_photo_deletion(array['20000000-0000-4000-8000-000000000003']::uuid[]);
    raise exception 'FAIL: authenticated user executed an admin RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_reserve_photo_upload('10000000-0000-4000-8000-000000000003', 'x', 0, 1, 1, 1, 1, 999999999);
    raise exception 'FAIL: authenticated user reserved storage';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin
    perform * from public.admin_storage_usage();
    raise exception 'FAIL: anon read storage usage';
  exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'ok 7 - admin RPCs are not callable by anon / authenticated';
end $$;

-- 8. RLS + column privileges ----------------------------------------------------------------------
begin;
set local role anon;
do $$ begin
  if exists (select 1 from public.photos where id in ('20000000-0000-4000-8000-000000000009',
       '20000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000011'))
  or exists (select 1 from public.matches where status <> 'published') then
    raise exception 'FAIL: anon sees deleted/draft/archived/uploading content';
  end if;
  if not exists (select 1 from public.photos where id = '20000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: anon lost access to a published photo';
  end if;
  begin
    perform original_key from public.photos limit 1;
    raise exception 'FAIL: anon can read original_key';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.purchases limit 1;
    if found then raise exception 'FAIL: anon reads purchases'; end if;
  end;
end $$;
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
do $$ begin
  if not exists (select 1 from public.matches where id = '10000000-0000-4000-8000-000000000004')
  or not exists (select 1 from public.photos where id = '20000000-0000-4000-8000-000000000008') then
    raise exception 'FAIL: admin must preview drafts';
  end if;
  begin
    perform original_key from public.photos limit 1;
    raise exception 'FAIL: the browser (even admin) can read original_key';
  exception when insufficient_privilege then null; end;
end $$;
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
do $$ begin
  if exists (select 1 from public.matches where id = '10000000-0000-4000-8000-000000000004') then
    raise exception 'FAIL: non-admin user sees drafts';
  end if;
  update public.profiles set is_admin = true where id = '00000000-0000-4000-8000-0000000000b2';
  if (select is_admin from public.profiles where id = '00000000-0000-4000-8000-0000000000b2') then
    raise exception 'FAIL: a user promoted their own profile to admin';
  end if;
  raise notice 'ok 8 - RLS: public sees only published content, originals hidden from the browser, no self-promotion to admin';
end $$;
commit;
