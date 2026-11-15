import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-server";
import { budgetLevel } from "@/lib/photo-deletion-core";
import { getStorageBudgetBytes } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// GET /api/admin/storage — space used (from the sizes recorded at upload, including uploads in
// progress), against the configured operational budget.
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const { data, error } = await supabase
      .rpc("admin_storage_usage")
      .single<{ used_bytes: number; photos: number; albums: number; incomplete_uploads: number }>();
    if (error) throw new Error(`storage usage: ${error.message}`);

    const usedBytes = Number(data.used_bytes ?? 0);
    const budgetBytes = getStorageBudgetBytes();
    return NextResponse.json({
      ok: true,
      usedBytes,
      budgetBytes,
      availableBytes: Math.max(0, budgetBytes - usedBytes),
      level: budgetLevel(usedBytes, budgetBytes),
      photos: Number(data.photos ?? 0),
      albums: Number(data.albums ?? 0),
      incompleteUploads: Number(data.incomplete_uploads ?? 0),
    });
  } catch (error) {
    return adminErrorResponse(error, "storage usage");
  }
}
