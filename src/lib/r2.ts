import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

// Minimal structural view of the Workers R2 binding (R2Bucket) used by this app.
export type R2ObjectLike = {
  key: string;
  size: number;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
};
export type R2ObjectBodyLike = R2ObjectLike & { body: ReadableStream };
export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  delete(keys: string | string[]): Promise<void>;
}

export type PhotoBuckets = { media: R2BucketLike; originals: R2BucketLike };

export class StorageConfigError extends Error {
  constructor() {
    super("R2_NOT_CONFIGURED");
  }
}

// Bindings declared in wrangler.jsonc. In `next dev` they are local (Miniflare) buckets.
export async function getPhotoBuckets(): Promise<PhotoBuckets> {
  const { env } = await getCloudflareContext({ async: true });
  const bindings = env as unknown as { MEDIA_BUCKET?: R2BucketLike; ORIGINALS_BUCKET?: R2BucketLike };
  if (!bindings.MEDIA_BUCKET || !bindings.ORIGINALS_BUCKET) throw new StorageConfigError();
  return { media: bindings.MEDIA_BUCKET, originals: bindings.ORIGINALS_BUCKET };
}

// Operational budget (default 8 GB, below R2's free 10 GB-month). Configurable per environment.
export const DEFAULT_STORAGE_BUDGET_BYTES = 8_000_000_000;
export function getStorageBudgetBytes() {
  const value = Number(process.env.STORAGE_BUDGET_BYTES);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_STORAGE_BUDGET_BYTES;
}

export const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
export const MAX_THUMB_BYTES = 2 * 1024 * 1024;
export const MAX_HERO_BYTES = 5 * 1024 * 1024;
