import { NextResponse } from "next/server";
import { adminErrorResponse, AdminRequestError, requireAdmin } from "@/lib/admin-server";
import { parseIdList } from "@/lib/photo-deletion-core";
import { previewDeletion } from "@/lib/photo-deletion";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MAX_PREVIEW_PHOTOS = 5000;
const MAX_PREVIEW_ALBUMS = 50;

// POST /api/admin/deletions/preview  { photoIds?: string[] } | { albumIds?: string[] }
// Read-only: what would be deleted, what is protected and the estimated space freed.
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    const body = await request.json().catch(() => null);

    if (body?.albumIds !== undefined) {
      const matchIds = parseIdList(body.albumIds, MAX_PREVIEW_ALBUMS);
      if (!matchIds) throw new AdminRequestError("Selección de álbumes inválida.");
      return NextResponse.json({ ok: true, ...(await previewDeletion(supabase, { matchIds })) });
    }

    const photoIds = parseIdList(body?.photoIds, MAX_PREVIEW_PHOTOS);
    if (!photoIds) throw new AdminRequestError("Selección de fotos inválida.");
    return NextResponse.json({ ok: true, ...(await previewDeletion(supabase, { photoIds })) });
  } catch (error) {
    return adminErrorResponse(error, "deletion preview");
  }
}
