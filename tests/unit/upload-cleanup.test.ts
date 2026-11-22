import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { reconcile } = vi.hoisted(() => ({ reconcile: vi.fn(async () => ({ checked: 0, released: 0, confirmed: 0 })) }));
vi.mock("@/lib/purchases-server", () => ({ reconcileUnresolvedPurchases: reconcile }));

const { cleanupStaleUploads, STALE_UPLOAD_MINUTES } = await import("@/lib/photo-deletion");

const MATCH = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

type Row = { id: string; status: string; created_at: string; sold?: boolean };

// Tiny stateful stand-in for the PostgREST calls used by cleanupStaleUploads/executeDeletionBatch.
function setup(rows: Row[], hooks: { beforeClaim?: () => void } = {}) {
  const orFilters: string[] = [];
  const table = () => {
    let op: "select" | "update" = "select";
    let values: Partial<Row> = {};
    let preds: Array<(r: Row) => boolean> = [];
    let limit = Infinity;
    const q: Record<string, unknown> = {
      select: () => q,
      update: (v: Partial<Row>) => {
        op = "update";
        values = v;
        return q;
      },
      or: (expr: string) => {
        orFilters.push(expr);
        const cutoff = expr.match(/created_at\.lt\.([^)]+)\)/)![1];
        preds.push((r) => r.status === "pending_deletion" || (r.status === "uploading" && r.created_at < cutoff));
        return q;
      },
      in: (col: keyof Row, list: string[]) => ((preds.push((r) => list.includes(String(r[col])))), q),
      eq: (col: keyof Row, v: string) => ((preds.push((r) => r[col] === v)), q),
      lt: (col: keyof Row, v: string) => ((preds.push((r) => String(r[col]) < v)), q),
      order: () => q,
      limit: (n: number) => ((limit = n), q),
      then: (resolve: (v: unknown) => void) => {
        if (op === "update") hooks.beforeClaim?.();
        const hit = rows.filter((r) => preds.every((p) => p(r))).slice(0, limit);
        if (op === "update") for (const r of hit) Object.assign(r, values);
        preds = [];
        resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      },
    };
    return q;
  };

  const media = { delete: vi.fn(async () => undefined) };
  const originals = { delete: vi.fn(async () => undefined) };
  const supabase = {
    from: table,
    rpc: async (name: string, args: { p_photo_ids: string[]; p_dry_run?: boolean }) => {
      const hit = rows.filter((r) => args.p_photo_ids.includes(r.id));
      if (name === "admin_prepare_photo_deletion") {
        return {
          data: hit.map((r) => ({
            photo_id: r.id, match_id: MATCH, sold: false, bytes: 1000,
            outcome: r.status === "deleted" ? "already_deleted" : r.sold ? "download_active" : "eligible",
            original_key: `${MATCH}/${r.id}`, watermark_url: `/media/${MATCH}/${r.id}-preview.jpg`, thumbnail_url: null,
          })),
          error: null,
        };
      }
      let count = 0;
      for (const r of hit) if (r.status === "pending_deletion") ((r.status = "deleted"), count++);
      return { data: count, error: null };
    },
  } as unknown as SupabaseClient;
  return { supabase, buckets: { media, originals } as never, orFilters, media, originals, rows };
}

describe("cleanupStaleUploads", () => {
  it("only targets interrupted deletions and uploads older than the in-progress window", async () => {
    const t = setup([
      { id: id(1), status: "uploading", created_at: minutesAgo(STALE_UPLOAD_MINUTES + 5) },
      { id: id(2), status: "uploading", created_at: minutesAgo(2) }, // in progress: untouched
      { id: id(3), status: "active", created_at: minutesAgo(600) }, // published: untouched
    ]);
    const result = await cleanupStaleUploads(t.supabase, t.buckets);
    expect(result).toMatchObject({ cleaned: 1, failed: 0, more: false });
    expect(t.rows.map((r) => r.status)).toEqual(["deleted", "uploading", "active"]);
    expect(t.originals.delete).toHaveBeenCalledWith([`${MATCH}/${id(1)}`]);
  });

  it("finishes interrupted deletions and releases their space", async () => {
    const t = setup([
      { id: id(1), status: "pending_deletion", created_at: minutesAgo(1) },
      { id: id(2), status: "uploading", created_at: minutesAgo(120) },
    ]);
    expect(await cleanupStaleUploads(t.supabase, t.buckets)).toMatchObject({ cleaned: 2, freedBytes: 2000 });
    expect(t.rows.every((r) => r.status === "deleted")).toBe(true);
  });

  it("never deletes an upload that was completed while the cleanup was running (race)", async () => {
    const rows: Row[] = [{ id: id(1), status: "uploading", created_at: minutesAgo(45) }];
    // The admin's "complete" wins between the cleanup's lookup and its claim.
    const t = setup(rows, { beforeClaim: () => (rows[0].status = "active") });
    expect(await cleanupStaleUploads(t.supabase, t.buckets)).toMatchObject({ cleaned: 0 });
    expect(rows[0].status).toBe("active");
    expect(t.originals.delete).not.toHaveBeenCalled();
    expect(t.media.delete).not.toHaveBeenCalled();
  });

  it("does not touch protected photos (active download) even if left pending", async () => {
    const t = setup([{ id: id(1), status: "pending_deletion", created_at: minutesAgo(10), sold: true }]);
    expect(await cleanupStaleUploads(t.supabase, t.buckets)).toMatchObject({ cleaned: 0 });
    expect(t.originals.delete).not.toHaveBeenCalled();
  });

  it("works in batches of 50 and does nothing when there is nothing to clean", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: id(i + 1), status: "uploading", created_at: minutesAgo(90) }));
    const t = setup(many);
    expect(await cleanupStaleUploads(t.supabase, t.buckets)).toMatchObject({ cleaned: 50, more: true });
    expect(await cleanupStaleUploads(t.supabase, t.buckets)).toMatchObject({ cleaned: 10, more: false });
    const empty = setup([]);
    expect(await cleanupStaleUploads(empty.supabase, empty.buckets)).toEqual({ cleaned: 0, failed: 0, freedBytes: 0, more: false });
  });
});
