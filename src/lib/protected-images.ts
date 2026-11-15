// Photo storage (Cloudflare R2):
//   ORIGINAL  → bucket "vision-pelusa-originals" (private; only the Worker reads it through its
//               binding, after validating a purchase). photos.original_key.
//   PREVIEW   → bucket "vision-pelusa-media" (public, watermark baked into the pixels). photos.watermark_url
//   THUMBNAIL → bucket "vision-pelusa-media". photos.thumbnail_url
//   HERO      → bucket "vision-pelusa-media". matches.hero_url
//
// Public media is served from NEXT_PUBLIC_MEDIA_URL (an R2 custom domain, cached by Cloudflare's
// CDN) or, when it is not configured, from this app's /media route (Worker → R2 binding).
export const MEDIA_ROUTE = "/media";

export const MEDIA_BASE_URL = (process.env.NEXT_PUBLIC_MEDIA_URL ?? "").trim().replace(/\/+$/, "") || MEDIA_ROUTE;

const KEY_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

// Media keys always have the form "<album uuid>/<file name>".
export const isMediaKey = (key: string) => KEY_RE.test(key) && !key.includes("..");

export const mediaUrl = (key: string) => `${MEDIA_BASE_URL}/${key}`;

export function mediaKeyFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  for (const base of new Set([MEDIA_BASE_URL, MEDIA_ROUTE])) {
    if (value.startsWith(`${base}/`)) {
      const key = value.slice(base.length + 1);
      return isMediaKey(key) ? key : null;
    }
  }
  return null;
}

// Only watermarked media from our public bucket may be rendered publicly; anything else
// (legacy values, external URLs, originals) is rejected.
export function protectedImageUrl(value: unknown): string | undefined {
  return mediaKeyFromUrl(value) ? (value as string) : undefined;
}
