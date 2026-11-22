import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { reconcile } = vi.hoisted(() => ({ reconcile: vi.fn(async () => ({ checked: 0, released: 0, confirmed: 0 })) }));
vi.mock("@/lib/purchases-server", () => ({ reconcileUnresolvedPurchases: reconcile }));

const { cleanupStaleUploads, STALE_UPLOAD_MINUTES } = await import("@/lib/photo-deletion");

const MATCH = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

function setup(rows: Array<{ id: string; status: string }>) {
  const filters: string[] = [];
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.or = (expr: string) => {
    filters.push(expr);
    return builder;
  };
  builder.order = () => builder;
  builder.limit = (n: number) => Promise.resolve({ data: rows.slice(0, n).map((r) => ({ id: r.id })), error: null });

  const media = { delete: vi.fn(async () => undefined) };
  const originals = { delete: vi.fn(async () => undefined) };
  const supabase = {
    from: () => builder,
    rpc: async (name: string, args: { p_photo_ids: string[]; p_dry_run?: boolean }) => {
      if (name === "admin_prepare_photo_deletion") {
        return {
          data: rows
            .filter((r) => args.p_photo_ids.includes(r.id))
            .map((r) => ({
              photo_id: r.id, match_id: MATCH, outcome: "eligible", sold: false, bytes: 1000,
              original_key: `${MATCH}/${r.id}`, watermark_url: `/media/${MATCH}/${r.id}-preview.jpg`, thumbnail_url: null,
            })),
          error: null,
        };
      }
      return { data: args.p_photo_ids.length, error: null };
    },
  } as unknown as SupabaseClient;
  return { supabase, buckets: { media, originals } as never, filters, media, originals };
}

describe("cleanupStaleUploads", () => {
  it("only targets interrupted deletions and uploads older than the in-progress window", async () => {
    const t = setup([{ id: id(1), status: "uploading" }]);
    await cleanupStaleUploads(t.supabase, t.buckets);
    expect(t.filters[0]).toMatch(/^status\.eq\.pending_deletion,and\(status\.eq\.uploading,created_at\.lt\.\d{4}-\d{2}-\d{2}T/);
    const cutoff = new Date(t.filters[0].match(/created_at\.lt\.([^)]+)\)/)![1]).getTime();
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(STALE_UPLOAD_MINUTES * 60_000 - 1000);
  });

  it("removes their R2 objects and releases the reservations", async () => {
    const t = setup([{ id: id(1), status: "uploading" }, { id: id(2), status: "pending_deletion" }]);
    const result = await cleanupStaleUploads(t.supabase, t.buckets);
    expect(result).toMatchObject({ cleaned: 2, failed: 0, freedBytes: 2000, more: false });
    expect(t.originals.delete).toHaveBeenCalledWith([`${MATCH}/${id(1)}`, `${MATCH}/${id(2)}`]);
    expect(t.media.delete).toHaveBeenCalled();
  });

  it("reports when more remain (batches of 50) and does nothing when there is nothing to clean", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: id(i + 1), status: "uploading" }));
    expect(await cleanupStaleUploads(setup(many).supabase, setup(many).buckets)).toMatchObject({ more: true });
    const empty = setup([]);
    expect(await cleanupStaleUploads(empty.supabase, empty.buckets)).toEqual({ cleaned: 0, failed: 0, freedBytes: 0, more: false });
    expect(empty.originals.delete).not.toHaveBeenCalled();
  });
});
