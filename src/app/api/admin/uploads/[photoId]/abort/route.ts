import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { isUuid } from "@/lib/photo-deletion-core";
import { executeDeletionBatch } from "@/lib/photo-deletion";
import { getPhotoBuckets } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// POST /api/admin/uploads/{photoId}/abort — a failed upload releases its reservation and any
// object already sent. Only for photos still 'uploading' (never for published photos).
export async function POST(request: Request, ctx: RouteContext<"/api/admin/uploads/[photoId]/abort">) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const { photoId } = await ctx.params;
    if (!isUuid(photoId)) throw new AdminRequestError("Foto inválida.");
    const id = photoId.toLowerCase();

    const { data: photo, error } = await supabase.from("photos").select("status").eq("id", id).maybeSingle();
    if (error) throw new Error(`photo lookup: ${error.message}`);
    if (!photo || photo.status === "deleted") return NextResponse.json({ ok: true });
    if (photo.status !== "uploading" && photo.status !== "pending_deletion") {
      throw new AdminRequestError("Solo se pueden cancelar cargas incompletas.", 409);
    }
    const result = await executeDeletionBatch(supabase, await getPhotoBuckets(), [id]);
    return NextResponse.json({ ok: result.failed === 0 });
  } catch (error) {
    return adminErrorResponse(error, "upload abort");
  }
}
