import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminRequestError } from "./admin-server";
import { mediaKeyFromUrl } from "./protected-images";
import { reconcileUnresolvedPurchases } from "./purchases-server";
import type { PhotoBuckets } from "./r2";
import {
  chunk,
  isSafeAlbumPath,
  MAX_KEYS_PER_DELETE,
  photosSafeToFinalize,
  storageTargetsForPhoto,
  summarize,
  type PreparedPhoto,
} from "./photo-deletion-core";

const RPC_ID_CHUNK = 500;

function check<T>(result: { data: T; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

async function prepare(supabase: SupabaseClient, photoIds: string[], dryRun: boolean): Promise<PreparedPhoto[]> {
  const rows: PreparedPhoto[] = [];
  for (const ids of chunk(photoIds, RPC_ID_CHUNK)) {
    const data = check(
      await supabase.rpc("admin_prepare_photo_deletion", { p_photo_ids: ids, p_dry_run: dryRun }),
      "admin_prepare_photo_deletion",
    );
    rows.push(...((data ?? []) as PreparedPhoto[]).map((row) => ({ ...row, bytes: Number(row.bytes ?? 0) })));
  }
  return rows;
}

// Releases purchases that Mercado Pago proves unpayable, then classifies again.
async function prepareWithReconciliation(supabase: SupabaseClient, photoIds: string[], dryRun: boolean) {
  const first = await prepare(supabase, photoIds, true);
  const unresolved = first.filter((row) => row.outcome === "pending_payment").map((row) => row.photo_id);
  if (unresolved.length) await reconcileUnresolvedPurchases(unresolved);
  return dryRun && !unresolved.length ? first : prepare(supabase, photoIds, dryRun);
}

async function photoIdsOfAlbums(supabase: SupabaseClient, matchIds: string[]) {
  const ids: string[] = [];
  for (const matchId of matchIds) {
    // Paged: PostgREST caps a response at 1000 rows.
    for (let from = 0; ; from += 1000) {
      const data = check(
        await supabase.from("photos").select("id").eq("match_id", matchId).neq("status", "deleted").order("id").range(from, from + 999),
        "album photos lookup",
      ) as Array<{ id: string }>;
      ids.push(...data.map((row) => row.id));
      if (data.length < 1000) break;
    }
  }
  return ids;
}

export async function listAlbumPhotos(supabase: SupabaseClient, matchId: string) {
  const { data: album, error: albumError } = await supabase.from("matches").select("id, title, status").eq("id", matchId).maybeSingle();
  if (albumError) throw new Error(`album lookup: ${albumError.message}`);
  if (!album || album.status === "deleted") throw new AdminRequestError("El álbum no existe.", 404);

  type Row = { id: string; title: string; thumbnail_url: string | null; created_at: string; status: string; original_bytes: number; preview_bytes: number; thumb_bytes: number };
  const photos: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const data = check(
      await supabase
        .from("photos")
        .select("id, title, thumbnail_url, created_at, status, original_bytes, preview_bytes, thumb_bytes")
        .eq("match_id", matchId)
        .neq("status", "deleted")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, from + 999),
      "album photos lookup",
    ) as Row[];
    photos.push(...data);
    if (data.length < 1000) break;
  }

  const prepared = new Map((await prepare(supabase, photos.map((p) => p.id), true)).map((row) => [row.photo_id, row]));

  return {
    album: { id: album.id as string, title: album.title as string, status: album.status as string },
    photos: photos.map((photo) => ({
      id: photo.id,
      title: photo.title,
      thumbnailUrl: photo.thumbnail_url,
      createdAt: photo.created_at,
      status: photo.status,
      bytes: Number(photo.original_bytes) + Number(photo.preview_bytes) + Number(photo.thumb_bytes),
      outcome: prepared.get(photo.id)?.outcome ?? "eligible",
      sold: prepared.get(photo.id)?.sold ?? false,
    })),
  };
}

export async function previewDeletion(supabase: SupabaseClient, input: { photoIds?: string[]; matchIds?: string[] }) {
  const photoIds = input.matchIds?.length ? await photoIdsOfAlbums(supabase, input.matchIds) : input.photoIds ?? [];
  const rows = photoIds.length ? await prepareWithReconciliation(supabase, photoIds, true) : [];
  return summarize(rows);
}

/**
 * One batch (≤ MAX_PHOTOS_PER_BATCH). Idempotent and retryable:
 *   1. lock + mark eligible photos 'pending_deletion' (new purchases are blocked from here on),
 *   2. delete their R2 objects (deleting a missing key is not an error),
 *   3. mark 'deleted' only the photos whose objects were all deleted.
 * Photos whose deletion failed stay 'pending_deletion' (hidden) and are picked up again on retry.
 */
export async function executeDeletionBatch(supabase: SupabaseClient, buckets: PhotoBuckets, photoIds: string[]) {
  const rows = await prepareWithReconciliation(supabase, photoIds, false);
  const summary = summarize(rows);
  const targets = rows.filter((row) => row.outcome === "eligible").flatMap(storageTargetsForPhoto);

  const failedKeys = new Set<string>();
  for (const bucket of ["originals", "media"] as const) {
    const bucketTargets = targets.filter((t) => t.bucket === bucket);
    for (const group of chunk(bucketTargets, MAX_KEYS_PER_DELETE)) {
      try {
        await buckets[bucket].delete(group.map((t) => t.key));
      } catch (error) {
        console.error("[photo-deletion] R2 delete failed", { bucket, count: group.length, message: error instanceof Error ? error.message : error });
        for (const t of group) failedKeys.add(`${t.bucket}/${t.key}`);
      }
    }
  }

  const { ok, failed } = photosSafeToFinalize(summary.eligibleIds, targets, failedKeys);
  const finalized = ok.length
    ? Number(check(await supabase.rpc("admin_finalize_photo_deletion", { p_photo_ids: ok }), "admin_finalize_photo_deletion") ?? 0)
    : 0;
  const freedBytes = rows.filter((row) => ok.includes(row.photo_id)).reduce((sum, row) => sum + row.bytes, 0);

  return {
    deleted: finalized,
    alreadyDeleted: summary.alreadyDeleted,
    downloadActive: summary.downloadActive,
    pendingPayment: summary.pendingPayment,
    failed: failed.length,
    failedIds: failed,
    freedBytes,
  };
}

// Uploads that never completed keep their reserved space ('uploading'), and deletions interrupted
// half-way stay 'pending_deletion'. Neither can be purchased (purchase_items_guard), so finishing
// them is always safe: their R2 objects are removed (missing keys are fine) and the reservation is
// released. Uploads younger than STALE_UPLOAD_MINUTES may still be in progress and are left alone.
export const STALE_UPLOAD_MINUTES = 30;

export async function cleanupStaleUploads(supabase: SupabaseClient, buckets: PhotoBuckets, limit = MAX_STALE_PER_CALL) {
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from("photos")
    .select("id")
    .or(`status.eq.pending_deletion,and(status.eq.uploading,created_at.lt.${cutoff})`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`stale uploads lookup: ${error.message}`);
  const candidates = (data ?? []).map((row) => row.id as string);
  if (!candidates.length) return { cleaned: 0, failed: 0, freedBytes: 0, more: false };

  // Claim the stale uploads atomically (uploading → pending_deletion, unpublished). This UPDATE and
  // the upload's "complete" UPDATE are both conditional on status = 'uploading': only one wins, so
  // a photo completed in the meantime is never deleted.
  const { data: claimed, error: claimError } = await supabase
    .from("photos")
    .update({ status: "pending_deletion", is_published: false })
    .in("id", candidates)
    .eq("status", "uploading")
    .lt("created_at", cutoff)
    .select("id");
  if (claimError) throw new Error(`stale uploads claim: ${claimError.message}`);
  const { data: pending, error: pendingError } = await supabase
    .from("photos")
    .select("id")
    .in("id", candidates)
    .eq("status", "pending_deletion");
  if (pendingError) throw new Error(`stale uploads recheck: ${pendingError.message}`);
  const ids = Array.from(new Set([...(claimed ?? []), ...(pending ?? [])].map((row) => row.id as string)));
  if (!ids.length) return { cleaned: 0, failed: 0, freedBytes: 0, more: candidates.length === limit };

  // Only photos now 'pending_deletion' go on: executeDeletionBatch re-validates purchases (locked).
  const result = await executeDeletionBatch(supabase, buckets, ids);
  return { cleaned: result.deleted, failed: result.failed, freedBytes: result.freedBytes, more: candidates.length === limit };
}

const MAX_STALE_PER_CALL = 50;

// Closes an album deletion after its batches ran: no photos left → the album is marked deleted
// (row kept) and its hero removed; protected photos left → it is archived (hidden, no sales).
export async function finalizeAlbumDeletion(supabase: SupabaseClient, buckets: PhotoBuckets, matchId: string) {
  const { data: album, error } = await supabase.from("matches").select("id, status, hero_url").eq("id", matchId).maybeSingle();
  if (error) throw new Error(`album lookup: ${error.message}`);
  if (!album) throw new AdminRequestError("El álbum no existe.", 404);
  if (album.status === "deleted") return { status: "deleted" as const, remaining: 0 };

  const countBy = async (statuses: string[]) => {
    const { count, error: countError } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("match_id", matchId)
      .in("status", statuses);
    if (countError) throw new Error(`photo count: ${countError.message}`);
    return count ?? 0;
  };

  if ((await countBy(["pending_deletion"])) > 0) {
    throw new AdminRequestError("Quedan fotos con la eliminación incompleta. Reintentá la eliminación.", 409);
  }

  const remaining = await countBy(["active", "uploading"]);
  if (remaining > 0) {
    check(await supabase.from("matches").update({ status: "archived" }).eq("id", matchId), "archive album");
    return { status: "archived" as const, remaining };
  }

  const heroKey = mediaKeyFromUrl(album.hero_url);
  if (heroKey && isSafeAlbumPath(heroKey, matchId)) await buckets.media.delete(heroKey);

  check(
    await supabase
      .from("matches")
      .update({ status: "deleted", deleted_at: new Date().toISOString(), hero_url: null, hero_bytes: 0 })
      .eq("id", matchId),
    "mark album deleted",
  );
  return { status: "deleted" as const, remaining: 0 };
}

export async function setAlbumArchived(supabase: SupabaseClient, matchId: string, archived: boolean) {
  // Restore goes back to draft on purpose: the admin re-publishes it explicitly from "Editar".
  const { data, error } = await supabase
    .from("matches")
    .update({ status: archived ? "archived" : "draft" })
    .eq("id", matchId)
    .in("status", archived ? ["draft", "published"] : ["archived"])
    .select("id, status");
  if (error) throw new Error(`archive album: ${error.message}`);
  if (!data?.length) throw new AdminRequestError(archived ? "El álbum no se puede archivar." : "El álbum no está archivado.", 409);
  return { status: data[0].status as string };
}
