import { NextResponse } from "next/server";
import { buildProtectedDownload } from "@/lib/storage";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const photoId = String(body?.photoId ?? "vision-pelusa-photo");
    const imageUrl = String(body?.imageUrl ?? "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80");

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

    return NextResponse.json(payload);
  } catch (error) {
    console.error("download route error", error);
    return NextResponse.json(
      {
        ok: false,
        imageUrl: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80",
        watermarkedUrl: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80&watermark=vision-pelusa",
        downloadUrl: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80&watermark=vision-pelusa",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const photoId = url.searchParams.get("photoId") ?? "vision-pelusa-photo";
  const imageUrl = url.searchParams.get("imageUrl") ?? "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80";

  return NextResponse.json(await buildProtectedDownload(imageUrl, photoId));
}
