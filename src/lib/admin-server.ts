import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";

export class AdminAuthError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
  }
}

// The admin panel keeps its Supabase session in the browser (no cookies), so every admin API call
// sends `Authorization: Bearer <access_token>`. The token is verified with Supabase Auth and the
// admin flag is read server-side with the service role: hiding buttons is never the protection.
export async function requireAdmin(request: Request, supabase: SupabaseClient = getSupabaseAdmin()) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new AdminAuthError("Sesión requerida.", 401);

  const { data, error } = await supabase.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) throw new AdminAuthError("Sesión inválida o vencida.", 401);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || profile?.is_admin !== true) {
    throw new AdminAuthError("La cuenta no tiene permisos de administrador.", 403);
  }

  return { userId, email: data.user?.email ?? "" };
}

export class AdminRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

// Shared error → response mapping for /api/admin/*. Unknown errors never leak details.
export function adminErrorResponse(error: unknown, context: string) {
  if (error instanceof AdminAuthError || error instanceof AdminRequestError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
  }
  console.error(`[admin] ${context}`, error instanceof Error ? error.message : error);
  return NextResponse.json({ ok: false, message: "No se pudo completar la operación." }, { status: 500 });
}
