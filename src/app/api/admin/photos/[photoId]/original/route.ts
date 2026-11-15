import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { isUuid } from "@/lib/photo-deletion-core";
import { getPhotoBuckets } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// GET /api/admin/photos/{photoId}/original — admin only. Used to generate the Home hero image
// in the browser from the original. Never cached.
export async function GET(request: Request, ctx: RouteContext<"/api/admin/photos/[photoId]/original">) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const { photoId } = await ctx.params;
    if (!isUuid(photoId)) throw new AdminRequestError("Foto inválida.");

    const { data: photo, error } = await supabase
      .from("photos")
      .select("original_key, status")
      .eq("id", photoId.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(`photo lookup: ${error.message}`);
    if (!photo?.original_key || photo.status !== "active") throw new AdminRequestError("La foto no está disponible.", 404);

    const object = await (await getPhotoBuckets()).originals.get(photo.original_key);
    if (!object) throw new AdminRequestError("No se encontró el original.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return adminErrorResponse(error, "admin original");
  }
}
