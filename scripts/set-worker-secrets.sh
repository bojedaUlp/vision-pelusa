#!/usr/bin/env bash
# Loads the Worker runtime secrets from the local, gitignored env files. Values are piped to
# `wrangler secret put` (never printed, never passed as arguments).
#   SUPABASE_SERVICE_ROLE_KEY  ← .env.production.local (new project sigjpwmbcefapjaopuxr)
#   MERCADO_PAGO_ACCESS_TOKEN  ← .env.local (production APP_USR token)
# WARNING: `wrangler secret put` publishes a new Worker version immediately. Run only as part of an
# authorized deployment.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER="vision-pelusa"
EXPECTED_REF="sigjpwmbcefapjaopuxr"

read_var() { grep -E "^\s*$2\s*=" "$ROOT/$1" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^\s*["'"'"']?//; s/["'"'"']?\s*$//'; }

for f in .env.production.local .env.local; do
  git -C "$ROOT" check-ignore -q "$ROOT/$f" || { echo "ABORTADO: $f no está ignorado por git"; exit 1; }
done
[[ "$(read_var .env.production.local NEXT_PUBLIC_SUPABASE_URL)" == "https://$EXPECTED_REF.supabase.co" ]] || { echo "ABORTADO: .env.production.local no es del proyecto $EXPECTED_REF"; exit 1; }

SERVICE_KEY="$(read_var .env.production.local SUPABASE_SERVICE_ROLE_KEY)"
MP_TOKEN="$(read_var .env.local MERCADO_PAGO_ACCESS_TOKEN)"
[[ "$SERVICE_KEY" == sb_secret_* || "$SERVICE_KEY" == eyJ* ]] || { echo "ABORTADO: SUPABASE_SERVICE_ROLE_KEY con formato inesperado"; exit 1; }
[[ "$MP_TOKEN" == APP_USR-* ]] || { echo "ABORTADO: MERCADO_PAGO_ACCESS_TOKEN no es de producción (APP_USR-)"; exit 1; }

printf '%s' "$SERVICE_KEY" | npx --no-install wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name "$WORKER" 2>&1 | grep -E "Success|ERROR" || true
printf '%s' "$MP_TOKEN" | npx --no-install wrangler secret put MERCADO_PAGO_ACCESS_TOKEN --name "$WORKER" 2>&1 | grep -E "Success|ERROR" || true
unset SERVICE_KEY MP_TOKEN
echo "Secretos cargados (valores no mostrados)."
