import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { reconcile } = vi.hoisted(() => ({
  reconcile: vi.fn(async (photoIds?: string[]) => ({ checked: photoIds?.length ?? 0, released: 0, confirmed: 0 })),
}));
vi.mock("@/lib/purchases-server", () => ({ reconcileUnresolvedPurchases: reconcile }));

const { executeDeletionBatch } = await import("@/lib/photo-deletion");

// In-memory stand-ins for Supabase and the two R2 buckets. The RPCs mirror the SQL rules of
// supabase/schema.sql (the SQL itself is tested in supabase/tests).
const MATCH = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

type Photo = {
  id: string;
  status: string;
  purchase?: "paid_active" | "paid_expired" | "pending";
  original_key: string | null;
  watermark_url: string | null;
  thumbnail_url: string | null;
};

function fakeBucket(keys: string[], failOnce = false) {
  const objects = new Set(keys);
  let fail = failOnce;
  return {
    objects,
    delete: vi.fn(async (input: string | string[]) => {
      if (fail) {
        fail = false;
        throw new Error("temporary R2 error");
      }
      for (const key of Array.isArray(input) ? input : [input]) objects.delete(key); // missing key → no error
    }),
  };
}

function setup(photos: Photo[], options: { failMediaOnce?: boolean } = {}) {
  const originals = fakeBucket(photos.map((p) => `${MATCH}/${p.id}`));
  const media = fakeBucket(
    photos.flatMap((p) => [`${MATCH}/${p.id}-preview.jpg`, `${MATCH}/${p.id}-thumb.jpg`]),
    options.failMediaOnce,
  );
  const supabase = {
    rpc: async (name: string, args: { p_photo_ids: string[]; p_dry_run?: boolean }) => {
      if (name === "admin_prepare_photo_deletion") {
        const data = photos
          .filter((p) => args.p_photo_ids.includes(p.id))
          .map((p) => {
            const outcome =
              p.status === "deleted" ? "already_deleted"
              : p.purchase === "paid_active" ? "download_active"
              : p.purchase === "pending" ? "pending_payment"
              : "eligible";
            if (outcome === "eligible" && !args.p_dry_run) p.status = "pending_deletion";
            return {
              photo_id: p.id, match_id: MATCH, outcome, sold: p.purchase?.startsWith("paid") ?? false,
              original_key: p.original_key, watermark_url: p.watermark_url, thumbnail_url: p.thumbnail_url, bytes: 300,
            };
          });
        return { data, error: null };
      }
      if (name === "admin_finalize_photo_deletion") {
        let count = 0;
        for (const p of photos) {
          if (args.p_photo_ids.includes(p.id) && p.status === "pending_deletion") {
            Object.assign(p, { status: "deleted", original_key: null, watermark_url: null, thumbnail_url: null });
            count += 1;
          }
        }
        return { data: count, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  } as unknown as SupabaseClient;
  const buckets = { originals, media } as unknown as Parameters<typeof executeDeletionBatch>[1];
  return { supabase, buckets, originals, media, photos };
}

const makePhoto = (n: number, purchase?: Photo["purchase"]): Photo => ({
  id: id(n),
  status: "active",
  purchase,
  original_key: `${MATCH}/${id(n)}`,
  watermark_url: `/media/${MATCH}/${id(n)}-preview.jpg`,
  thumbnail_url: `/media/${MATCH}/${id(n)}-thumb.jpg`,
});

beforeEach(() => reconcile.mockClear());

describe("executeDeletionBatch (R2)", () => {
  it("deletes an unsold photo: original + preview + thumbnail, row marked deleted, space reported", async () => {
    const t = setup([makePhoto(1)]);
    const result = await executeDeletionBatch(t.supabase, t.buckets, [id(1)]);
    expect(result).toMatchObject({ deleted: 1, failed: 0, freedBytes: 300 });
    expect(t.originals.objects.size + t.media.objects.size).toBe(0);
    expect(t.photos[0]).toMatchObject({ status: "deleted", original_key: null });
  });

  it("deletes sold photos whose downloads expired, keeps those with active downloads or unresolved payments", async () => {
    const t = setup([makePhoto(1, "paid_expired"), makePhoto(2, "paid_active"), makePhoto(3, "pending")]);
    const result = await executeDeletionBatch(t.supabase, t.buckets, [id(1), id(2), id(3)]);
    expect(result).toMatchObject({ deleted: 1, downloadActive: 1, pendingPayment: 1 });
    expect(t.originals.objects.has(`${MATCH}/${id(1)}`)).toBe(false);
    expect(t.originals.objects.has(`${MATCH}/${id(2)}`)).toBe(true);
    expect(t.originals.objects.has(`${MATCH}/${id(3)}`)).toBe(true);
    expect(reconcile).toHaveBeenCalledWith([id(3)]); // unresolved payments are checked with Mercado Pago first
  });

  it("deletes many photos with one R2 delete call per bucket", async () => {
    const t = setup([1, 2, 3, 4, 5].map((n) => makePhoto(n)));
    const result = await executeDeletionBatch(t.supabase, t.buckets, [1, 2, 3, 4, 5].map(id));
    expect(result.deleted).toBe(5);
    expect(t.originals.delete).toHaveBeenCalledTimes(1);
    expect(t.media.delete).toHaveBeenCalledTimes(1);
  });

  it("on an R2 error leaves the photo pending (hidden); a retry completes it without duplicating effects", async () => {
    const t = setup([makePhoto(1)], { failMediaOnce: true });

    const first = await executeDeletionBatch(t.supabase, t.buckets, [id(1)]);
    expect(first).toMatchObject({ deleted: 0, failed: 1, failedIds: [id(1)] });
    expect(t.photos[0].status).toBe("pending_deletion");

    const retry = await executeDeletionBatch(t.supabase, t.buckets, [id(1)]);
    expect(retry).toMatchObject({ deleted: 1, failed: 0 });
    expect(t.media.objects.size).toBe(0);

    const again = await executeDeletionBatch(t.supabase, t.buckets, [id(1)]);
    expect(again).toMatchObject({ deleted: 0, alreadyDeleted: 1, failed: 0 });
  });
});
