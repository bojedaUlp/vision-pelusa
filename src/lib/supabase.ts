import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://cvawwrxpdshebfizfgvp.supabase.co";
const fallbackSupabaseAnonKey = "sb_publishable_TUuUZo60svB5P7gyUdqulw_JdxxHzlb";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? fallbackSupabaseUrl).trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fallbackSupabaseAnonKey).trim();

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
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
