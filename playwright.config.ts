import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// E2E runs ONLY against a local stack:
//   - Supabase local (Docker): `supabase start`, then `supabase status -o env > e2e.env`
//   - R2: local Miniflare buckets from wrangler.jsonc (via `next dev` + OpenNext dev bindings)
//   - Mercado Pago: tests/e2e/mock-mercadopago.ts (never the real API)
// Usage: E2E_ENV_FILE=/path/to/e2e.env npm run test:e2e
const envFile = process.env.E2E_ENV_FILE;
if (!envFile) throw new Error("E2E_ENV_FILE is required (output of `supabase status -o env` for a LOCAL stack).");

const localEnv = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1], match[2]]),
);

const supabaseUrl = localEnv.API_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(supabaseUrl)) {
  throw new Error(`Refusing to run E2E against a non-local Supabase: ${supabaseUrl}`);
}

const PORT = 3100;
const MP_PORT = 4010;
export const e2e = {
  appUrl: `http://localhost:${PORT}`,
  mpUrl: `http://127.0.0.1:${MP_PORT}`,
  supabaseUrl,
  anonKey: localEnv.ANON_KEY,
  serviceRoleKey: localEnv.SERVICE_ROLE_KEY,
  budgetBytes: 20_000_000,
};
process.env.E2E_SUPABASE_URL = supabaseUrl;
process.env.E2E_ANON_KEY = e2e.anonKey;
process.env.E2E_SERVICE_ROLE_KEY = e2e.serviceRoleKey;
process.env.E2E_APP_URL = e2e.appUrl;
process.env.E2E_MP_URL = e2e.mpUrl;
process.env.E2E_MP_PORT = String(MP_PORT);
process.env.E2E_BUDGET_BYTES = String(e2e.budgetBytes);

// E2E_TARGET=workers runs the same suite on the real Workers runtime (workerd via `wrangler dev`)
// against the OpenNext build in .open-next — build it first with the same local values:
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… NEXT_PUBLIC_APP_URL=http://localhost:3100 npm run build
const runtimeVars: Record<string, string> = {
  SUPABASE_SERVICE_ROLE_KEY: e2e.serviceRoleKey,
  MERCADO_PAGO_ACCESS_TOKEN: "TEST-local-e2e",
  MERCADO_PAGO_API_URL: e2e.mpUrl,
  STORAGE_BUDGET_BYTES: String(e2e.budgetBytes),
  MP_PREFERENCE_EXPIRATION_HOURS: "72",
};
const workersCommand = [
  `npx wrangler dev --port ${PORT} --ip 127.0.0.1 --local`,
  ...Object.entries(runtimeVars).map(([key, value]) => `--var ${key}:${value}`),
].join(" ");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: e2e.appUrl, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: process.env.E2E_TARGET === "workers" ? workersCommand : `npx next dev -p ${PORT}`,
    url: `${e2e.appUrl}/api/payments/webhook`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: e2e.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: e2e.serviceRoleKey,
      NEXT_PUBLIC_APP_URL: e2e.appUrl,
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-local-e2e",
      MERCADO_PAGO_API_URL: e2e.mpUrl,
      STORAGE_BUDGET_BYTES: String(e2e.budgetBytes),
      MP_PREFERENCE_EXPIRATION_HOURS: "72",
      NEXT_PUBLIC_MEDIA_URL: "",
    },
  },
});
