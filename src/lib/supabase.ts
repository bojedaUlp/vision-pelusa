import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://cvawwrxpdshebfizfgvp.supabase.co";
const fallbackSupabaseAnonKey = "sb_publishable_TUuUZo60svB5P7gyUdqulw_JdxxHzlb";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fallbackSupabaseUrl;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fallbackSupabaseAnonKey;

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export function getSupabaseClient() {
  return supabase;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fallbackSupabaseUrl || fallbackSupabaseAnonKey);
}
