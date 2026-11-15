import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { isUuid } from "@/lib/photo-deletion-core";
import { listAlbumPhotos } from "@/lib/photo-deletion";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// GET /api/admin/albums/{albumId}/photos → the album's photos with their deletion status
// (eligible / sold / pending_payment). Admin only.
export async function GET(request: Request, ctx: RouteContext<"/api/admin/albums/[albumId]/photos">) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const { albumId } = await ctx.params;
    if (!isUuid(albumId)) throw new AdminRequestError("Álbum inválido.");
    return NextResponse.json({ ok: true, ...(await listAlbumPhotos(supabase, albumId.toLowerCase())) });
  } catch (error) {
    return adminErrorResponse(error, "album photos");
  }
}
