import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Only for route handlers / server code.
// SUPABASE_SERVICE_ROLE_KEY must never carry the NEXT_PUBLIC_ prefix.
let adminClient: SupabaseClient | null = null;

export type SupabaseAdminConfigCode =
  | "MISSING_SUPABASE_URL"
  | "INVALID_SUPABASE_URL"
  | "MISSING_SERVICE_ROLE"
  | "CLIENT_INIT_FAILED";

// The message is the code only: never includes a value.
export class SupabaseAdminConfigError extends Error {
  constructor(public readonly code: SupabaseAdminConfigCode) {
    super(`CONFIG_${code}`);
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  // Read at request time: on Cloudflare these must exist in the Worker runtime (secret/var),
  // not only during `next build`. OpenNext copies the Worker env bindings into process.env.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url) throw new SupabaseAdminConfigError("MISSING_SUPABASE_URL");
  if (!/^https?:\/\/[^\s"']+$/.test(url)) throw new SupabaseAdminConfigError("INVALID_SUPABASE_URL");
  if (!serviceRoleKey) throw new SupabaseAdminConfigError("MISSING_SERVICE_ROLE");

  try {
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    console.error("[supabase-admin] createClient failed:", error instanceof Error ? error.message : "unknown");
    throw new SupabaseAdminConfigError("CLIENT_INIT_FAILED");
  }

  return adminClient;
}
