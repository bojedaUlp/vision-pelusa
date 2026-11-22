import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_URL = "https://sigjpwmbcefapjaopuxr.supabase.co";

function readEnv() {
  const env: Record<string, string> = {};
  for (const line of readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

// Temporary admin for the smoke test; removed (with the smoke data) in the teardown.
export default async function globalSetup() {
  const env = readEnv();
  if (env.NEXT_PUBLIC_SUPABASE_URL !== EXPECTED_URL) throw new Error("Unexpected Supabase project.");
  const service = createClient(EXPECTED_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const email = `smoke-${Date.now()}@visionpelusa-smoke.invalid`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const { error: promoteError } = await service.from("profiles").update({ is_admin: true }).eq("id", data.user.id);
  if (promoteError) throw new Error(`promote failed: ${promoteError.message}`);

  process.env.SMOKE_ADMIN_EMAIL = email;
  process.env.SMOKE_ADMIN_PASSWORD = password;
  process.env.SMOKE_SUPABASE_URL = EXPECTED_URL;
  process.env.SMOKE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.SMOKE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const slug = `smoke-${Date.now()}`;
  process.env.SMOKE_SLUG = slug;

  return async () => {
    // Remove the throwaway album rows (no purchases reference them) and the temporary admin.
    // Every throwaway album of this run (slug and slug-*), only if no purchase references it.
    const { data: albums } = await service.from("matches").select("id").like("slug", `${slug}%`);
    for (const album of albums ?? []) {
      const { data: photoRows } = await service.from("photos").select("id").eq("match_id", album.id);
      const ids = (photoRows ?? []).map((row) => row.id);
      const { count } = ids.length
        ? await service.from("purchase_items").select("id", { count: "exact", head: true }).in("photo_id", ids)
        : { count: 0 };
      if (count) continue;
      await service.from("photos").delete().eq("match_id", album.id);
      await service.from("matches").delete().eq("id", album.id);
    }
    await service.auth.admin.deleteUser(data.user.id);
  };
}
