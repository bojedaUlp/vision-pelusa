import { NextResponse } from "next/server";
import { getOriginalDownloadUrl, PurchaseFlowError } from "@/lib/purchases-server";

// GET /api/download/{photoId}?purchaseId=... → 302 to a 60s signed URL of the original (no watermark).
export async function GET(request: Request, ctx: RouteContext<"/api/download/[photoId]">) {
  const { photoId } = await ctx.params;
  const purchaseId = new URL(request.url).searchParams.get("purchaseId");

  try {
    const downloadUrl = await getOriginalDownloadUrl({ purchaseId, photoId });
    return NextResponse.redirect(downloadUrl, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PurchaseFlowError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    console.error("download route error", { photoId, purchaseId, error });
    return NextResponse.json({ ok: false, message: "No se pudo procesar la descarga." }, { status: 500 });
  }
}
