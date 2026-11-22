// Verifies the NEW Supabase project (and, with --site, the deployed site). Prints only OK/FALLA,
// never keys or data. Reads values from the environment or from .env.production.local (gitignored):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Usage: node scripts/verify-supabase.mjs [--site https://visionpelusa.com] [--media https://media.visionpelusa.com]
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.production.local")) {
  for (const line of readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
let failed = false;
const ok = (msg) => console.log(`  OK     ${msg}`);
const bad = (msg) => {
  console.log(`  FALLA  ${msg}`);
  failed = true;
};
const check = async (msg, fn) => {
  try {
    (await fn()) ? ok(msg) : bad(msg);
  } catch (error) {
    bad(`${msg} (${error instanceof Error ? error.message.slice(0, 120) : "error"})`);
  }
};

console.log("1. Configuración");
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) bad("NEXT_PUBLIC_SUPABASE_URL no parece un proyecto Supabase (https://<ref>.supabase.co)");
else ok("URL del proyecto con formato válido");
if (!anonKey) bad("falta NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceKey) console.log("  (sin SUPABASE_SERVICE_ROLE_KEY: se omiten las verificaciones de administrador)");

if (url && anonKey) {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  console.log("2. Esquema y seguridad (como visitante anónimo)");
  await check("el proyecto responde y la tabla matches existe", async () => !(await anon.from("matches").select("id").limit(1)).error);
  await check("el público NO puede leer photos.original_key", async () => Boolean((await anon.from("photos").select("original_key").limit(1)).error));
  await check("el público NO ve compras", async () => ((await anon.from("purchases").select("id").limit(1)).data ?? []).length === 0);
  await check("el público NO puede ejecutar funciones de administración", async () => Boolean((await anon.rpc("admin_storage_usage")).error));
  await check("registro público de usuarios desactivado", async () => {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    return (await response.json()).disable_signup === true;
  });
}

if (url && serviceKey) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  console.log("3. Administración (service role)");
  await check("función admin_storage_usage disponible", async () => !(await admin.rpc("admin_storage_usage")).error);
  await check("hay exactamente un usuario administrador", async () => {
    const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true);
    return !error && count === 1;
  });
  await check("base vacía al inicio (sin álbumes heredados)", async () => {
    const { count } = await admin.from("matches").select("id", { count: "exact", head: true });
    return count === 0;
  });
}

const site = arg("--site");
if (site) {
  console.log(`4. Sitio ${site}`);
  await check("la Home responde 200", async () => (await fetch(site)).status === 200);
  await check("webhook de Mercado Pago responde", async () => (await fetch(`${site}/api/payments/webhook`)).status === 200);
  await check("API de administración rechaza sin sesión (401)", async () => (await fetch(`${site}/api/admin/storage`)).status === 401);
  await check("descarga sin compra rechazada", async () => {
    const status = (await fetch(`${site}/api/download/00000000-0000-4000-8000-000000000000?purchaseId=00000000-0000-4000-8000-000000000000`)).status;
    return status === 403;
  });
  await check("el sitio apunta al Supabase nuevo", async () => {
    const html = await (await fetch(`${site}/galerias`)).text();
    const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"]+\.js/g)].map((m) => m[0]);
    for (const chunk of chunks) if ((await (await fetch(`${site}${chunk}`)).text()).includes(new URL(url).host)) return true;
    return false;
  });
}

const media = arg("--media");
if (media) {
  console.log(`5. Media pública ${media}`);
  await check("el dominio de media responde desde R2 (404 para una clave inexistente)", async () => {
    const response = await fetch(`${media}/00000000-0000-4000-8000-000000000000/no-existe.jpg`);
    return response.status === 404;
  });
}

console.log(failed ? "\nHay verificaciones con FALLA." : "\nTodo OK.");
process.exit(failed ? 1 : 0);
