import { isMediaKey } from "@/lib/protected-images";
import { getPhotoBuckets } from "@/lib/r2";

// GET /media/<album>/<file> — public, watermarked media only (previews, thumbnails, heroes) from
// the PUBLIC bucket. Originals live in another bucket that this route cannot reach.
// In production prefer NEXT_PUBLIC_MEDIA_URL (R2 custom domain): served by Cloudflare's CDN
// without consuming Worker requests. This route is the fallback and the local-dev path.
export async function GET(request: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isMediaKey(key)) return new Response("Not found", { status: 404 });

  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cached = cache ? await cache.match(request).catch(() => undefined) : undefined;
  if (cached) return cached;

  const object = await (await getPhotoBuckets()).media.get(key);
  if (!object) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

  const response = new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
  if (cache) await cache.put(request, response.clone()).catch(() => undefined);
  return response;
}
