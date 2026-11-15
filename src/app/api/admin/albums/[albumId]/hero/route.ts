import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { isSafeAlbumPath, isUuid } from "@/lib/photo-deletion-core";
import { mediaKeyFromUrl, mediaUrl } from "@/lib/protected-images";
import { getPhotoBuckets, getStorageBudgetBytes, MAX_HERO_BYTES } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { heroKey } from "@/lib/uploads";

// PUT /api/admin/albums/{albumId}/hero — raw JPEG generated in the admin (discreet mark only).
// Replaces the album's Home image; the previous file is removed after the new one is saved.
export async function PUT(request: Request, ctx: RouteContext<"/api/admin/albums/[albumId]/hero">) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const { albumId } = await ctx.params;
    if (!isUuid(albumId)) throw new AdminRequestError("Álbum inválido.");
    const id = albumId.toLowerCase();

    const { data: album, error } = await supabase.from("matches").select("id, status, hero_url, hero_bytes").eq("id", id).maybeSingle();
    if (error) throw new Error(`album lookup: ${error.message}`);
    if (!album || album.status === "deleted") throw new AdminRequestError("El álbum no existe.", 404);

    const body = await request.arrayBuffer();
    if (body.byteLength <= 0 || body.byteLength > MAX_HERO_BYTES) throw new AdminRequestError("Imagen inválida.", 413);

    const { data: usage, error: usageError } = await supabase.rpc("admin_storage_usage").single<{ used_bytes: number }>();
    if (usageError) throw new Error(`storage usage: ${usageError.message}`);
    if (Number(usage.used_bytes) - Number(album.hero_bytes ?? 0) + body.byteLength > getStorageBudgetBytes()) {
      throw new AdminRequestError("No hay espacio suficiente en el almacenamiento.", 507);
    }

    const buckets = await getPhotoBuckets();
    const key = heroKey(id, Date.now());
    await buckets.media.put(key, body, {
      httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" },
    });

    const { error: updateError } = await supabase
      .from("matches")
      .update({ hero_url: mediaUrl(key), hero_bytes: body.byteLength })
      .eq("id", id);
    if (updateError) {
      await buckets.media.delete(key);
      throw new Error(`save hero: ${updateError.message}`);
    }

    const previousKey = mediaKeyFromUrl(album.hero_url);
    if (previousKey && previousKey !== key && isSafeAlbumPath(previousKey, id) && previousKey.startsWith(`${id}/hero-`)) {
      await buckets.media.delete(previousKey).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, heroUrl: mediaUrl(key) });
  } catch (error) {
    return adminErrorResponse(error, "album hero");
  }
}
