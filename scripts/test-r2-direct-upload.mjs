// Verifies presigned direct uploads against the REAL R2 buckets, with throwaway objects only
// (key prefix 00000000-0000-4000-8000-000000000000/diag-*), deleted at the end. Prints results only,
// never credentials. Needs R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in .env.production.local.
// Usage: node scripts/test-r2-direct-upload.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*["']?(.*?)["']?\s*$/);
  if (m) env[m[1]] = m[2];
}
const wrangler = readFileSync("wrangler.jsonc", "utf8");
process.env.R2_ACCOUNT_ID = wrangler.match(/"R2_ACCOUNT_ID":\s*"([0-9a-f]{32})"/)?.[1] ?? "";
process.env.R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID ?? "";
process.env.R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY ?? "";

// The presigner is dependency-free TypeScript; Node ≥ 22.18 strips the types natively.
const { getR2DirectConfig, presignR2Put, presignUrl } = await import("../src/lib/r2-presign.ts");

const config = getR2DirectConfig();
if (!config) {
  console.log("FALLA  faltan R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY en .env.production.local");
  process.exit(1);
}
const host = `${config.accountId}.r2.cloudflarestorage.com`;
let failed = false;
const check = (ok, msg) => {
  console.log(`  ${ok ? "OK   " : "FALLA"}  ${msg}`);
  if (!ok) failed = true;
};
const sign = (method, bucket, key, expiresSeconds = 300) =>
  presignUrl({ method, host, path: `/${bucket}/${key}`, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, expiresSeconds });

for (const bucket of ["vision-pelusa-originals", "vision-pelusa-media"]) {
  console.log(`== ${bucket}`);
  const key = `00000000-0000-4000-8000-000000000000/diag-${Date.now()}`;
  const body = randomBytes(bucket.endsWith("originals") ? 30_000_000 : 300_000);
  try {
    const url = await presignR2Put(config, bucket, key, "image/jpeg", body.length);

    const started = Date.now();
    const ok = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body });
    check(ok.status === 200, `PUT firmado de ${(body.length / 1e6).toFixed(1)} MB → HTTP ${ok.status} (${Date.now() - started} ms)`);

    const wrongSize = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: body.subarray(0, body.length - 1) });
    check(wrongSize.status === 403, `tamaño distinto al firmado → rechazado (HTTP ${wrongSize.status})`);

    const wrongType = await fetch(url, { method: "PUT", headers: { "Content-Type": "text/html" }, body });
    check(wrongType.status === 403, `tipo distinto al firmado → rechazado (HTTP ${wrongType.status})`);

    const expired = await presignR2Put(config, bucket, `${key}-expired`, "image/jpeg", 10, 1);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const late = await fetch(expired, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: body.subarray(0, 10) });
    check(late.status === 403, `URL vencida → rechazada (HTTP ${late.status})`);

    const unsigned = await fetch(`https://${host}/${bucket}/${key}`);
    check(unsigned.status === 400 || unsigned.status === 401 || unsigned.status === 403, `lectura sin firma → rechazada (HTTP ${unsigned.status})`);

    const preflight = (origin) =>
      fetch(url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
    const allowed = await preflight("https://visionpelusa.com");
    check(allowed.headers.get("access-control-allow-origin") === "https://visionpelusa.com", `CORS: visionpelusa.com permitido (HTTP ${allowed.status})`);
    const evil = await preflight("https://evil.example");
    check(!evil.headers.get("access-control-allow-origin"), `CORS: otro origen NO permitido (HTTP ${evil.status})`);
  } finally {
    const del = await fetch(await sign("DELETE", bucket, key), { method: "DELETE" });
    check(del.status === 204 || del.status === 200, `objeto de prueba eliminado (HTTP ${del.status})`);
    const gone = await fetch(await sign("GET", bucket, key));
    check(gone.status === 404, `objeto de prueba ya no existe (HTTP ${gone.status})`);
  }
}
console.log(failed ? "\nHay verificaciones con FALLA." : "\nTodo OK.");
process.exit(failed ? 1 : 0);
