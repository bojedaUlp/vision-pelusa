// R2 keys of a photo, always generated server-side from the album and photo ids (never from the
// browser), so they are unique per photo and confined to the album folder.
export const uploadKeys = (matchId: string, photoId: string) => ({
  original: `${matchId}/${photoId}`,
  preview: `${matchId}/${photoId}-preview.jpg`,
  thumb: `${matchId}/${photoId}-thumb.jpg`,
});

export const heroKey = (matchId: string, timestamp: number) => `${matchId}/hero-${timestamp}.jpg`;

// Must match the bucket_name of the bindings in wrangler.jsonc (used for direct, presigned uploads).
export const ORIGINALS_BUCKET_NAME = "vision-pelusa-originals";
export const MEDIA_BUCKET_NAME = "vision-pelusa-media";

export type UploadVariant = "original" | "preview" | "thumb";

// Where the browser sends each file: straight to R2 (presigned, no credentials in the browser) or,
// when direct uploads are not configured, to this app's Worker route.
export type UploadTarget = { url: string; direct: boolean; contentType: string };

