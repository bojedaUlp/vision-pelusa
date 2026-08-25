import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export const ADMIN_SESSION_KEY = "vision-pelusa-admin";

export function isAdminSessionActive() {
  if (typeof window === "undefined") return false;

  const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) return false;

  try {
    const value = JSON.parse(raw) as { userId?: string; expiresAt?: number };
    if (!value?.userId || !value?.expiresAt) return false;
    return value.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function setAdminSession(userId: string) {
  if (typeof window === "undefined") return;

  const normalized = (userId ?? "").trim();
  if (!normalized) return;

  const value = {
    userId: normalized,
    expiresAt: Date.now() + 1000 * 60 * 60 * 8,
  };

  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(value));
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}

export async function getCurrentAdminProfile() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || data.is_admin !== true) {
    return null;
  }

  return {
    id: data.id,
    email: data.email ?? user.email ?? "",
    isAdmin: data.is_admin,
    userId: user.id,
  };
}
