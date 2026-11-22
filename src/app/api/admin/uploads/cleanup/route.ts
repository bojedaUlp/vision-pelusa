import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-server";
import { cleanupStaleUploads } from "@/lib/photo-deletion";
import { getPhotoBuckets } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// POST /api/admin/uploads/cleanup — releases the space of failed/abandoned uploads and finishes
// interrupted deletions (≤ 50 per call; the admin panel repeats while `more` is true).
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    await requireAdmin(request, supabase);
    return NextResponse.json({ ok: true, ...(await cleanupStaleUploads(supabase, await getPhotoBuckets())) });
  } catch (error) {
    return adminErrorResponse(error, "uploads cleanup");
  }
}
