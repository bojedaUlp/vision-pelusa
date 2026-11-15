import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { MAX_PHOTOS_PER_BATCH, parseIdList } from "@/lib/photo-deletion-core";
import { executeDeletionBatch } from "@/lib/photo-deletion";
import { getPhotoBuckets } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// POST /api/admin/deletions/execute  { photoIds: string[] (≤ 50), confirm: "ELIMINAR" }
// Deletes one batch. Eligibility is re-validated in the database (locked) on every call, so the
// result never depends on what the browser believed. Safe to retry.
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const admin = await requireAdmin(request, supabase);
    const body = await request.json().catch(() => null);

    if (body?.confirm !== "ELIMINAR") throw new AdminRequestError("Falta la confirmación de la eliminación.");
    const photoIds = parseIdList(body?.photoIds, MAX_PHOTOS_PER_BATCH);
    if (!photoIds) throw new AdminRequestError(`Enviá entre 1 y ${MAX_PHOTOS_PER_BATCH} fotos por lote.`);

    const result = await executeDeletionBatch(supabase, await getPhotoBuckets(), photoIds);
    console.log("[admin] deletion batch", { admin: admin.userId, requested: photoIds.length, ...result, failedIds: undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return adminErrorResponse(error, "deletion execute");
  }
}
