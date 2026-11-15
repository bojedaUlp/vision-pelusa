import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { isUuid } from "@/lib/photo-deletion-core";
import { getStorageBudgetBytes, MAX_ORIGINAL_BYTES, MAX_PREVIEW_BYTES, MAX_THUMB_BYTES } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const isSize = (value: unknown, max: number) => Number.isInteger(value) && (value as number) > 0 && (value as number) <= max;

// POST /api/admin/uploads → reserves budget and creates the photo row ('uploading') BEFORE any
// byte is sent. Body: { albumId, title, sortOrder, price, originalBytes, previewBytes, thumbBytes }
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const body = await request.json().catch(() => null);

    if (!isUuid(body?.albumId)) throw new AdminRequestError("Álbum inválido.");
    if (!isSize(body?.originalBytes, MAX_ORIGINAL_BYTES)) {
      throw new AdminRequestError(`El archivo supera el máximo de ${MAX_ORIGINAL_BYTES / 1024 / 1024} MB.`);
    }
    if (!isSize(body?.previewBytes, MAX_PREVIEW_BYTES) || !isSize(body?.thumbBytes, MAX_THUMB_BYTES)) {
      throw new AdminRequestError("Las imágenes protegidas no son válidas.");
    }
    const title = String(body?.title ?? "").trim().slice(0, 200) || "Foto";
    const sortOrder = Number.isInteger(body?.sortOrder) ? body.sortOrder : 0;
    const price = Number.isInteger(body?.price) && body.price > 0 ? body.price : 1500;

    const { data, error } = await supabase.rpc("admin_reserve_photo_upload", {
      p_match_id: String(body.albumId).toLowerCase(),
      p_title: title,
      p_sort_order: sortOrder,
      p_price: price,
      p_original_bytes: body.originalBytes,
      p_preview_bytes: body.previewBytes,
      p_thumb_bytes: body.thumbBytes,
      p_budget_bytes: getStorageBudgetBytes(),
    });
    if (error) {
      if (error.message.includes("STORAGE_BUDGET_EXCEEDED")) {
        throw new AdminRequestError(
          "No hay espacio suficiente: se alcanzó el límite de almacenamiento. Eliminá un álbum anterior.",
          507,
        );
      }
      if (error.message.includes("ALBUM_NOT_FOUND")) throw new AdminRequestError("El álbum no existe.", 404);
      throw new Error(`reserve upload: ${error.message}`);
    }
    return NextResponse.json({ ok: true, photoId: data });
  } catch (error) {
    return adminErrorResponse(error, "upload reserve");
  }
}
