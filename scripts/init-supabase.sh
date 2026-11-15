#!/usr/bin/env bash
# Initializes ONLY the new Visión Pelusa Supabase project with supabase/schema.sql.
#   bash scripts/init-supabase.sh --check                 # read-only: connection + whether schema exists
#   bash scripts/init-supabase.sh --apply                 # apply schema.sql (refuses if already applied)
#   bash scripts/init-supabase.sh --promote-admin EMAIL   # mark that existing Auth user as the admin
# Credentials come from .env.production.local (gitignored) and are never printed:
#   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_URL (Session pooler URI, includes the DB password)
# psql runs in a throwaway Docker container (postgres:17-alpine).
set -euo pipefail

EXPECTED_REF="sigjpwmbcefapjaopuxr"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.production.local"

[[ -f "$ENV_FILE" ]] || { echo "Falta $ENV_FILE (ver supabase/README.md)"; exit 1; }
git -C "$ROOT" check-ignore -q "$ENV_FILE" || { echo "ABORTADO: .env.production.local no está ignorado por git"; exit 1; }

read_var() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^["'"'"'](.*)["'"'"']$/\1/'; }
SUPABASE_URL="$(read_var NEXT_PUBLIC_SUPABASE_URL)"
DB_URL="$(read_var SUPABASE_DB_URL)"

# Guard: this script can only ever touch the new project.
[[ "$SUPABASE_URL" == "https://$EXPECTED_REF.supabase.co" ]] || { echo "ABORTADO: NEXT_PUBLIC_SUPABASE_URL no es el proyecto $EXPECTED_REF"; exit 1; }
[[ "$DB_URL" == *"$EXPECTED_REF"* ]] || { echo "ABORTADO: SUPABASE_DB_URL no corresponde al proyecto $EXPECTED_REF"; exit 1; }

psql_run() {
  # The URI travels as an environment variable of the container, not as a visible argument.
  docker run --rm -i -e PGURI="$DB_URL" postgres:17-alpine sh -c 'psql "$PGURI" -v ON_ERROR_STOP=1 -X -q "$@"' psql "$@"
}

# Any connection/query error aborts: an error must never be read as "schema not applied".
schema_state() {
  local result
  if ! result="$(psql_run -tAc "select to_regclass('public.matches') is not null" 2>&1)"; then
    echo "ABORTADO: no se pudo consultar la base (revisá SUPABASE_DB_URL / contraseña)." >&2
    exit 1
  fi
  case "$result" in
    t) echo "applied" ;;
    f) echo "empty" ;;
    *) echo "ABORTADO: respuesta inesperada de la base." >&2; exit 1 ;;
  esac
}
schema_exists() { [[ "$(schema_state)" == "applied" ]]; }

case "${1:-}" in
  --check)
    STATE="$(schema_state)"
    echo "Conexión al proyecto $EXPECTED_REF: OK"
    if [[ "$STATE" == "applied" ]]; then echo "Esquema: YA aplicado"; else echo "Esquema: no aplicado (base vacía)"; fi
    ;;
  --apply)
    STATE="$(schema_state)"
    if [[ "$STATE" == "applied" ]]; then echo "ABORTADO: el esquema ya existe en $EXPECTED_REF. No se modifica nada."; exit 1; fi
    echo "Aplicando supabase/schema.sql en $EXPECTED_REF (una transacción)..."
    psql_run < "$ROOT/supabase/schema.sql" >/dev/null
    TABLES=$(psql_run -tAc "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('profiles','matches','photos','purchases','purchase_items','download_access')")
    FUNCS=$(psql_run -tAc "select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'admin_%'")
    echo "Tablas creadas: $TABLES/6 · funciones de administración: $FUNCS/4"
    [[ "$TABLES" == "6" && "$FUNCS" == "4" ]] || { echo "FALLA: esquema incompleto"; exit 1; }
    echo "Esquema aplicado correctamente."
    ;;
  --promote-admin)
    EMAIL="${2:-}"
    [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "Uso: --promote-admin EMAIL"; exit 1; }
    # psql only interpolates :'email' (safely quoted) in stdin scripts, not in -c.
    UPDATED=$(psql_run -tA -v email="$EMAIL" <<< "with u as (update public.profiles set is_admin = true where lower(email) = lower(:'email') returning 1) select count(*) from u;")
    [[ "$UPDATED" == "1" ]] || { echo "FALLA: no existe un usuario con ese email (crealo primero en Authentication → Users)"; exit 1; }
    ADMINS=$(psql_run -tAc "select count(*) from public.profiles where is_admin")
    echo "Administrador marcado. Administradores en total: $ADMINS"
    ;;
  *)
    echo "Uso: bash scripts/init-supabase.sh --check | --apply | --promote-admin EMAIL"; exit 1 ;;
esac
