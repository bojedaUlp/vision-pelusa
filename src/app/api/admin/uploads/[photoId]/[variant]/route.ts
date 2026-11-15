import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { isUuid } from "@/lib/photo-deletion-core";
import { getPhotoBuckets } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { uploadKeys } from "@/lib/uploads";

const VARIANTS = { original: "original_bytes", preview: "preview_bytes", thumb: "thumb_bytes" } as const;
type Variant = keyof typeof VARIANTS;

// PUT /api/admin/uploads/{photoId}/{original|preview|thumb} — raw file body. Only for a photo that
// is still 'uploading', and only exactly the number of bytes reserved for that variant.
export async function PUT(request: Request, ctx: RouteContext<"/api/admin/uploads/[photoId]/[variant]">) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const { photoId, variant } = await ctx.params;
    if (!isUuid(photoId) || !Object.hasOwn(VARIANTS, variant)) throw new AdminRequestError("Carga inválida.");

    const { data: photo, error } = await supabase
      .from("photos")
      .select("id, match_id, status, original_bytes, preview_bytes, thumb_bytes")
      .eq("id", photoId.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(`photo lookup: ${error.message}`);
    if (!photo || photo.status !== "uploading") throw new AdminRequestError("La foto no está esperando archivos.", 409);

    const expected = Number(photo[VARIANTS[variant as Variant]]);
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > 0 && declared !== expected) {
      throw new AdminRequestError("El tamaño no coincide con el reservado.", 413);
    }

    const contentType = variant === "original" ? (request.headers.get("content-type") ?? "").split(";")[0].trim() : "image/jpeg";
    if (!/^image\/[a-z0-9.+-]+$/i.test(contentType)) throw new AdminRequestError("Tipo de archivo no permitido.", 415);

    const body = await request.arrayBuffer();
    if (body.byteLength !== expected) throw new AdminRequestError("El tamaño no coincide con el reservado.", 413);

    const keys = uploadKeys(photo.match_id, photo.id);
    const buckets = await getPhotoBuckets();
    if (variant === "original") {
      await buckets.originals.put(keys.original, body, { httpMetadata: { contentType } });
    } else {
      await buckets.media.put(variant === "preview" ? keys.preview : keys.thumb, body, {
        httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error, "upload file");
  }
}
