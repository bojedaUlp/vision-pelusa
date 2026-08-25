import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export type ProtectedDownload = {
  ok: boolean;
  imageUrl: string;
  watermarkedUrl: string;
  downloadUrl: string;
};

export async function buildProtectedDownload(imageUrl: string, photoId: string): Promise<ProtectedDownload> {
  const safeSource = imageUrl || "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80";
  const watermarkedUrl = `${safeSource}${safeSource.includes("?") ? "&" : "?"}watermark=vision-pelusa`;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const storagePath = imageUrl.startsWith("/") ? imageUrl.replace(/^\//, "") : imageUrl;

      if (storagePath && !storagePath.startsWith("http")) {
        try {
          const { data, error } = await supabase.storage.from("photos").createSignedUrl(storagePath, 3600);

          if (!error && data?.signedUrl) {
            return {
              ok: true,
              imageUrl: data.signedUrl,
              watermarkedUrl: `${data.signedUrl}${data.signedUrl.includes("?") ? "&" : "?"}watermark=vision-pelusa`,
              downloadUrl: `${data.signedUrl}${data.signedUrl.includes("?") ? "&" : "?"}download=true&watermark=vision-pelusa`,
            };
          }
        } catch {
          // falls back below
        }
      }
    }
  }

  const fallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/download?photoId=${encodeURIComponent(photoId)}`;

  return {
    ok: true,
    imageUrl: safeSource,
    watermarkedUrl,
    downloadUrl: fallbackUrl,
  };
}
