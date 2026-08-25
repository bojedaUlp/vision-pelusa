import { NextResponse } from "next/server";
import { buildProtectedDownload } from "@/lib/storage";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { hasPaidPurchaseForEmail } from "@/lib/purchase-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim();
    const photoId = String(body?.photoId ?? "vision-pelusa-photo");
    const imageUrl = String(body?.imageUrl ?? "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80");

    if (!email || !hasPaidPurchaseForEmail(email)) {
      return NextResponse.json(
        { ok: false, message: "Necesitás una compra confirmada para descargar esta foto." },
        { status: 403 },
      );
    }

    const payload = await buildProtectedDownload(imageUrl, photoId);

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: bucketData } = await supabase.storage.listBuckets();
        if (bucketData?.some((bucket) => bucket.name === "photos")) {
          return NextResponse.json(payload);
        }
      }
    }

    return NextResponse.json({
      ...payload,
      ok: true,
      originalUrl: payload.downloadUrl,
      message: "Descarga autorizada",
    });
  } catch (error) {
    console.error("download route error", error);
    return NextResponse.json(
      {
        ok: false,
        message: "No se pudo procesar la descarga.",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim();
  const photoId = url.searchParams.get("photoId") ?? "vision-pelusa-photo";
  const imageUrl = url.searchParams.get("imageUrl") ?? "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80";

  if (!email || !hasPaidPurchaseForEmail(email)) {
    return NextResponse.json(
      { ok: false, message: "Todavía no tenés acceso a esta descarga." },
      { status: 403 },
    );
  }

  const payload = await buildProtectedDownload(imageUrl, photoId);
  return NextResponse.json({
    ...payload,
    ok: true,
    originalUrl: payload.downloadUrl,
    message: "Descarga autorizada",
  });
}
