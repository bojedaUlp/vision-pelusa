// Pure logic for photo/album deletion (no I/O), shared by the server, the admin UI and the tests.
import { mediaKeyFromUrl } from "./protected-images";

export type DeletionOutcome = "eligible" | "download_active" | "pending_payment" | "already_deleted";

export type PreparedPhoto = {
  photo_id: string;
  match_id: string;
  outcome: DeletionOutcome;
  sold: boolean;
  original_key: string | null;
  watermark_url: string | null;
  thumbnail_url: string | null;
  bytes: number;
};

export type StorageTarget = { bucket: "originals" | "media"; key: string; photoId: string };

// Max photos per execute request: 3 R2 deletes per photo go in 2 batched delete() calls, well
// inside the Cloudflare Workers limits. The admin panel loops over batches.
export const MAX_PHOTOS_PER_BATCH = 50;
// R2 delete() accepts up to 1000 keys per call.
export const MAX_KEYS_PER_DELETE = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

// Normalizes an untrusted list of ids: strings only, valid UUIDs only, no duplicates.
export function parseIdList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = Array.from(new Set(value.map((id) => String(id ?? "").trim().toLowerCase())));
  if (ids.length === 0 || ids.length > max || !ids.every(isUuid)) return null;
  return ids;
}

// A key is only deleted if it lives inside the photo's own album folder ("<album>/<file>").
// Anything else (external URLs, other albums, traversal) is never touched.
export function isSafeAlbumPath(key: string, matchId: string) {
  return (
    isUuid(matchId) &&
    key.startsWith(`${matchId}/`) &&
    key.length > matchId.length + 1 &&
    !key.split("/").some((segment) => segment === ".." || segment === "." || segment === "") &&
    !key.includes("\\")
  );
}

// Keys are generated server-side from the photo id, so files are never shared between photos.
export function storageTargetsForPhoto(photo: PreparedPhoto): StorageTarget[] {
  const candidates: Array<[StorageTarget["bucket"], string | null]> = [
    ["originals", photo.original_key],
    ["media", mediaKeyFromUrl(photo.watermark_url)],
    ["media", mediaKeyFromUrl(photo.thumbnail_url)],
  ];
  const targets: StorageTarget[] = [];
  for (const [bucket, key] of candidates) {
    if (key && isSafeAlbumPath(key, photo.match_id) && !targets.some((t) => t.bucket === bucket && t.key === key)) {
      targets.push({ bucket, key, photoId: photo.photo_id });
    }
  }
  return targets;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type DeletionSummary = {
  total: number;
  eligible: number;
  eligibleSold: number;
  downloadActive: number;
  pendingPayment: number;
  alreadyDeleted: number;
  estimatedBytes: number;
  eligibleIds: string[];
};

export function summarize(rows: PreparedPhoto[]): DeletionSummary {
  const eligibleRows = rows.filter((row) => row.outcome === "eligible");
  return {
    total: rows.length,
    eligible: eligibleRows.length,
    eligibleSold: eligibleRows.filter((row) => row.sold).length,
    downloadActive: rows.filter((row) => row.outcome === "download_active").length,
    pendingPayment: rows.filter((row) => row.outcome === "pending_payment").length,
    alreadyDeleted: rows.filter((row) => row.outcome === "already_deleted").length,
    estimatedBytes: eligibleRows.reduce((sum, row) => sum + Number(row.bytes ?? 0), 0),
    eligibleIds: eligibleRows.map((row) => row.photo_id),
  };
}

// After a batch: a photo is finalized only if every one of its files was removed.
export function photosSafeToFinalize(eligibleIds: string[], targets: StorageTarget[], failedKeys: Set<string>) {
  const failedPhotos = new Set(targets.filter((t) => failedKeys.has(`${t.bucket}/${t.key}`)).map((t) => t.photoId));
  return {
    ok: eligibleIds.filter((id) => !failedPhotos.has(id)),
    failed: eligibleIds.filter((id) => failedPhotos.has(id)),
  };
}

// Storage budget levels shown in the admin.
export function budgetLevel(usedBytes: number, budgetBytes: number): "ok" | "warning" | "critical" | "full" {
  const ratio = budgetBytes > 0 ? usedBytes / budgetBytes : 1;
  if (ratio >= 1) return "full";
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.8) return "warning";
  return "ok";
}
