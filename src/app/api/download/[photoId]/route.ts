import { NextResponse } from "next/server";
import { getOriginalDownload, PurchaseFlowError } from "@/lib/purchases-server";
import { getPhotoBuckets } from "@/lib/r2";

// GET /api/download/{photoId}?purchaseId=... → streams the ORIGINAL (no watermark) from the private
// R2 bucket after validating the purchase and its download window. No public or signed URL exists.
export async function GET(request: Request, ctx: RouteContext<"/api/download/[photoId]">) {
  const { photoId } = await ctx.params;
  const purchaseId = new URL(request.url).searchParams.get("purchaseId");

  try {
    const { originals } = await getPhotoBuckets();
    const download = await getOriginalDownload({ purchaseId, photoId, originals });
    return new Response(download.body, {
      status: 200,
      headers: {
        "Content-Type": download.contentType,
        "Content-Length": String(download.size),
        "Content-Disposition": `attachment; filename="${download.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof PurchaseFlowError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    console.error("download route error", { photoId, purchaseId, error });
    return NextResponse.json({ ok: false, message: "No se pudo procesar la descarga." }, { status: 500 });
  }
}
