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
    // What is REALLY stored must match the reservation: exact size and an image type (JPEG for the
    // public variants). Anything else is removed right away so it can never occupy space.
    const checks = [
      { bucket: buckets.originals, key: keys.original, object: original, bytes: Number(photo.original_bytes), type: /^image\/[a-z0-9.+-]+$/i },
      { bucket: buckets.media, key: keys.preview, object: preview, bytes: Number(photo.preview_bytes), type: /^image\/jpeg$/i },
      { bucket: buckets.media, key: keys.thumb, object: thumb, bytes: Number(photo.thumb_bytes), type: /^image\/jpeg$/i },
    ];
    const wrong = checks.filter((c) => c.object && (c.object.size !== c.bytes || !c.type.test(c.object.httpMetadata?.contentType ?? "")));
    if (wrong.length) {
      await Promise.all(wrong.map((c) => c.bucket.delete(c.key).catch(() => undefined)));
      throw new AdminRequestError("Los archivos recibidos no coinciden con la reserva. Volvé a subir la foto.", 409);
    }
    if (checks.some((c) => !c.object)) {
      throw new AdminRequestError("La carga está incompleta. Volvé a subir la foto.", 409);
    }

    // Conditional on 'uploading': if the stale-upload cleanup claimed this photo first, it is not
    // published (and the client is told so).
    const { data: published, error: updateError } = await supabase
      .from("photos")
      .update({ status: "active", is_published: true, watermark_url: mediaUrl(keys.preview), thumbnail_url: mediaUrl(keys.thumb) })
      .eq("id", photo.id)
      .eq("status", "uploading")
      .select("id");
    if (updateError) throw new Error(`publish photo: ${updateError.message}`);
    if (!published?.length) throw new AdminRequestError("La carga venció antes de completarse. Volvé a subir la foto.", 409);
    return NextResponse.json({ ok: true, thumbnailUrl: mediaUrl(keys.thumb) });
  } catch (error) {
    return adminErrorResponse(error, "upload complete");
  }
}
