import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { isUuid } from "@/lib/photo-deletion-core";
import { finalizeAlbumDeletion, setAlbumArchived } from "@/lib/photo-deletion";
import { getPhotoBuckets } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// POST /api/admin/albums/{albumId}  { action: "archive" | "restore" | "finalize-delete" }
export async function POST(request: Request, ctx: RouteContext<"/api/admin/albums/[albumId]">) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const { albumId } = await ctx.params;
    if (!isUuid(albumId)) throw new AdminRequestError("Álbum inválido.");
    const id = albumId.toLowerCase();

    const body = await request.json().catch(() => null);
    switch (body?.action) {
      case "archive":
        return NextResponse.json({ ok: true, ...(await setAlbumArchived(supabase, id, true)) });
      case "restore":
        return NextResponse.json({ ok: true, ...(await setAlbumArchived(supabase, id, false)) });
      case "finalize-delete":
        return NextResponse.json({ ok: true, ...(await finalizeAlbumDeletion(supabase, await getPhotoBuckets(), id)) });
      default:
        throw new AdminRequestError("Acción inválida.");
    }
  } catch (error) {
    return adminErrorResponse(error, "album action");
  }
}
