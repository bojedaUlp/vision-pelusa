import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { isUuid } from "@/lib/photo-deletion-core";
import { mediaUrl } from "@/lib/protected-images";
import { getPhotoBuckets } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { uploadKeys } from "@/lib/uploads";

// POST /api/admin/uploads/{photoId}/complete — verifies the 3 objects exist in R2 with the
// reserved sizes, then publishes the photo.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/uploads/[photoId]/complete">) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const { photoId } = await ctx.params;
    if (!isUuid(photoId)) throw new AdminRequestError("Foto inválida.");

    const { data: photo, error } = await supabase
      .from("photos")
      .select("id, match_id, status, original_bytes, preview_bytes, thumb_bytes, thumbnail_url")
      .eq("id", photoId.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(`photo lookup: ${error.message}`);
    if (!photo) throw new AdminRequestError("La foto no existe.", 404);
    if (photo.status === "active") return NextResponse.json({ ok: true, thumbnailUrl: photo.thumbnail_url });
    if (photo.status !== "uploading") throw new AdminRequestError("La foto no está esperando archivos.", 409);

    const keys = uploadKeys(photo.match_id, photo.id);
    const buckets = await getPhotoBuckets();
    const [original, preview, thumb] = await Promise.all([
      buckets.originals.head(keys.original),
      buckets.media.head(keys.preview),
      buckets.media.head(keys.thumb),
    ]);
    if (
      original?.size !== Number(photo.original_bytes) ||
      preview?.size !== Number(photo.preview_bytes) ||
      thumb?.size !== Number(photo.thumb_bytes)
    ) {
      throw new AdminRequestError("La carga está incompleta. Volvé a subir la foto.", 409);
    }

    const { error: updateError } = await supabase
      .from("photos")
      .update({ status: "active", is_published: true, watermark_url: mediaUrl(keys.preview), thumbnail_url: mediaUrl(keys.thumb) })
      .eq("id", photo.id)
      .eq("status", "uploading");
    if (updateError) throw new Error(`publish photo: ${updateError.message}`);
    return NextResponse.json({ ok: true, thumbnailUrl: mediaUrl(keys.thumb) });
  } catch (error) {
    return adminErrorResponse(error, "upload complete");
  }
}
