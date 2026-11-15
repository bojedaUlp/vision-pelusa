#!/usr/bin/env bash
# Cloudflare checks for Visión Pelusa. READ-ONLY by default; prints names/booleans, never secrets.
#   bash scripts/check-cloudflare.sh                  # verify
#   bash scripts/check-cloudflare.sh --create-buckets # also create the 2 R2 buckets if missing
# Requires `npx wrangler login` (interactive, done by the owner) beforehand.
set -uo pipefail

WORKER="vision-pelusa"
BUCKETS=("vision-pelusa-originals" "vision-pelusa-media")
SECRETS=("SUPABASE_SERVICE_ROLE_KEY" "MERCADO_PAGO_ACCESS_TOKEN")
CREATE=false
[[ "${1:-}" == "--create-buckets" ]] && CREATE=true

ok() { printf '  OK     %s\n' "$1"; }
bad() { printf '  FALLA  %s\n' "$1"; FAILED=1; }
FAILED=0
w() { npx --no-install wrangler "$@" 2>&1; }

echo "1. Sesión"
WHO=$(w whoami)
if grep -q "You are logged in" <<<"$WHO"; then
  ok "wrangler con sesión iniciada"
  ACCOUNTS=$(grep -cE "│ .* │ [0-9a-f]{32} │" <<<"$WHO")
  echo "         cuentas visibles: $ACCOUNTS"
else
  bad "wrangler sin sesión: ejecutá 'npx wrangler login'"; exit 1
fi

echo "2. Worker $WORKER"
DEPLOYS=$(w deployments list --name "$WORKER")
if grep -qiE "Created:|Version" <<<"$DEPLOYS"; then ok "el Worker existe en esta cuenta"; else bad "no se encontró el Worker en la cuenta activa (¿otra cuenta? usá CLOUDFLARE_ACCOUNT_ID)"; fi

echo "3. Secretos del Worker (solo nombres)"
SECRET_LIST=$(w secret list --name "$WORKER")
for s in "${SECRETS[@]}"; do
  if grep -q "\"$s\"" <<<"$SECRET_LIST"; then ok "$s definido"; else bad "$s no definido (wrangler secret put $s --name $WORKER)"; fi
done
if grep -q "MERCADO_PAGO_API_URL" <<<"$SECRET_LIST"; then bad "MERCADO_PAGO_API_URL NO debe existir en producción"; fi

echo "4. R2"
R2=$(w r2 bucket list)
if grep -qiE "R2.*(not enabled|enable R2)|10042" <<<"$R2"; then
  bad "R2 no está activado en la cuenta (Dashboard → R2 Object Storage → activar)"; exit 1
fi
for b in "${BUCKETS[@]}"; do
  if grep -q "name:[[:space:]]*$b\$\|\"$b\"\|^$b\$\|[[:space:]]$b\$" <<<"$R2"; then
    ok "bucket $b existe"
  elif $CREATE; then
    if w r2 bucket create "$b" | grep -qi "Created bucket"; then ok "bucket $b creado"; else bad "no se pudo crear $b"; fi
  else
    bad "bucket $b no existe (volvé a ejecutar con --create-buckets)"
  fi
done

echo "5. Acceso público"
for b in "${BUCKETS[@]}"; do
  DEV=$(w r2 bucket dev-url get "$b")
  if grep -qi "enabled" <<<"$DEV" && ! grep -qi "disabled\|not enabled" <<<"$DEV"; then
    bad "$b tiene r2.dev habilitado (deshabilitar: wrangler r2 bucket dev-url disable $b)"
  else ok "$b sin r2.dev"; fi
done
DOMAINS_ORIG=$(w r2 bucket domain list vision-pelusa-originals)
if grep -qi "visionpelusa" <<<"$DOMAINS_ORIG"; then bad "vision-pelusa-originals tiene un dominio público: quitarlo"; else ok "originales sin dominio público"; fi
DOMAINS_MEDIA=$(w r2 bucket domain list vision-pelusa-media)
if grep -qi "media.visionpelusa.com" <<<"$DOMAINS_MEDIA"; then ok "media.visionpelusa.com conectado a vision-pelusa-media"; else bad "falta el dominio media.visionpelusa.com en vision-pelusa-media (Dashboard → R2 → bucket → Settings → Custom Domains)"; fi

echo
if [[ $FAILED -eq 0 ]]; then echo "Cloudflare: todo OK"; else echo "Cloudflare: hay puntos pendientes (FALLA)"; fi
exit $FAILED
