#!/usr/bin/env bash
# Runs the schema tests in a THROWAWAY local Postgres container (Docker). Never touches
# Supabase or production. Usage: npm run test:db
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
NAME="vp-db-test-$$"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null && docker exec "$NAME" psql -U postgres -tAc "select 1" >/dev/null 2>&1 && break
  sleep 1
done

run() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
apply() { echo "→ $(basename "$1")"; run < "$1" >/dev/null; }

if [[ "${VP_STRICT_GRANTS:-}" == "1" ]]; then
  # Simulates a project that does NOT expose new tables automatically: schema.sql must grant explicitly.
  echo "→ 00_supabase_stub.sql (sin privilegios por defecto)"
  grep -v "alter default privileges" "$DIR/00_supabase_stub.sql" | run >/dev/null
else
  apply "$DIR/00_supabase_stub.sql"
fi
apply "$DIR/../schema.sql"

echo "→ 10_schema.test.sql"
run < "$DIR/10_schema.test.sql" 2>&1 | grep -E "ok [0-9]|FAIL|ERROR" | sed 's/^psql:[^ ]* //'

P6=20000000-0000-4000-8000-000000000006
P7=20000000-0000-4000-8000-000000000007

# 9. Concurrency: a checkout holding the photo row wins over a deletion that starts later.
run -c "begin;
  insert into public.purchases (id, buyer_email, status) values ('30000000-0000-4000-8000-000000000016', 'r@test.local', 'pending');
  insert into public.purchase_items (purchase_id, photo_id, unit_price) values ('30000000-0000-4000-8000-000000000016', '$P6', 1);
  select pg_sleep(3); commit;" >/dev/null &
sleep 1
OUT=$(run -tAc "select outcome from public.admin_prepare_photo_deletion(array['$P6']::uuid[], false)")
wait
STATUS=$(run -tAc "select status from public.photos where id = '$P6'")
if [[ "$OUT" == "pending_payment" && "$STATUS" == "active" ]]; then
  echo "ok 9 - concurrent checkout first: deletion waits and then protects the photo"
else
  echo "FAIL 9 - got outcome=$OUT status=$STATUS"; exit 1
fi

# 10. Concurrency: a deletion holding the photo row wins over a checkout that starts later.
run -c "begin; select outcome from public.admin_prepare_photo_deletion(array['$P7']::uuid[], false); select pg_sleep(3); commit;" >/dev/null &
sleep 1
set +e
ERR=$(run -c "insert into public.purchases (id, buyer_email, status) values ('30000000-0000-4000-8000-000000000017', 'r@test.local', 'pending');
  insert into public.purchase_items (purchase_id, photo_id, unit_price) values ('30000000-0000-4000-8000-000000000017', '$P7', 1);" 2>&1)
set -e
wait
if [[ "$ERR" == *PHOTO_NOT_AVAILABLE* ]]; then
  echo "ok 10 - concurrent deletion first: checkout waits and is rejected (PHOTO_NOT_AVAILABLE)"
else
  echo "FAIL 10 - checkout was not rejected: $ERR"; exit 1
fi

# 11. Concurrency: two uploads reserving at the same time can never overshoot the budget.
USED=$(run -tAc "select used_bytes from public.admin_storage_usage()")
BUDGET=$((USED + 150))
ALBUM=10000000-0000-4000-8000-000000000003
for i in 1 2; do
  ( run -tAc "select public.admin_reserve_photo_upload('$ALBUM', 'c$i', 0, 1500, 100, 1, 1, $BUDGET)" >/dev/null 2>&1 && echo ok || echo rejected ) > "/tmp/vp-res-$$-$i" &
done
wait
RESULTS="$(cat /tmp/vp-res-$$-1 /tmp/vp-res-$$-2 | sort | tr '\n' ' ')"
rm -f /tmp/vp-res-$$-1 /tmp/vp-res-$$-2
AFTER=$(run -tAc "select used_bytes from public.admin_storage_usage()")
if [[ "$RESULTS" == "ok rejected " && "$AFTER" -le "$BUDGET" ]]; then
  echo "ok 11 - concurrent reservations: one accepted, one rejected, budget respected ($AFTER <= $BUDGET)"
else
  echo "FAIL 11 - results: $RESULTS used: $AFTER budget: $BUDGET"; exit 1
fi

# 12. FK actions.
FK=$(run -tAc "select string_agg(conrelid::regclass::text || '.' || confdeltype::text, ',' order by 1) from pg_constraint
  where contype = 'f' and confrelid in ('public.photos'::regclass, 'public.matches'::regclass)")
if [[ "$FK" == *".c"* || "$FK" == *".n"* ]]; then
  echo "FAIL 12 - unexpected FK actions: $FK"; exit 1
fi
echo "ok 12 - FK actions: $FK"
