import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Public (anon/publishable) values, inlined at build time. No hardcoded fallback: the app must be
// built with the project it talks to (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const supabase = createSupabaseClient(supabaseUrl || "http://localhost.invalid", supabaseAnonKey || "missing", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function getSupabaseClient() {
  return supabase;
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
