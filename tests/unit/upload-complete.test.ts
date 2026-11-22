import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/admin/uploads/{id}/complete must verify what is REALLY stored in R2.
const PHOTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MATCH = "11111111-1111-4111-8111-111111111111";
const reserved = { id: PHOTO, match_id: MATCH, status: "uploading", original_bytes: 30_000_000, preview_bytes: 300_000, thumb_bytes: 50_000, thumbnail_url: null };

const state = vi.hoisted(() => ({
  objects: new Map<string, { size: number; httpMetadata: { contentType: string } }>(),
  deleted: [] as string[],
  publishedRows: 1,
  updates: 0,
}));

vi.mock("@/lib/admin-server", async (orig) => ({ ...(await orig<typeof import("@/lib/admin-server")>()), requireAdmin: vi.fn(async () => ({ userId: "admin" })) }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      let isUpdate = false;
      q.select = () => q;
      q.eq = () => q;
      q.update = () => ((isUpdate = true), q);
      q.maybeSingle = async () => ({ data: reserved, error: null });
      q.then = (resolve: (v: unknown) => void) => {
        if (isUpdate) state.updates += 1;
        resolve({ data: Array.from({ length: state.publishedRows }, () => ({ id: PHOTO })), error: null });
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/r2", async (orig) => {
  const bucket = (name: string) => ({
    head: async (key: string) => state.objects.get(`${name}/${key}`) ?? null,
    delete: async (key: string) => void state.deleted.push(`${name}/${key}`),
  });
  return { ...(await orig<typeof import("@/lib/r2")>()), getPhotoBuckets: async () => ({ originals: bucket("originals"), media: bucket("media") }) };
});

const { POST } = await import("@/app/api/admin/uploads/[photoId]/complete/route");
const call = () =>
  POST(new Request("https://x.test", { method: "POST" }), { params: Promise.resolve({ photoId: PHOTO }) } as never);

const store = (overrides: Partial<Record<"original" | "preview" | "thumb", { size: number; type: string } | null>> = {}) => {
  const files = {
    original: { size: 30_000_000, type: "image/jpeg" },
    preview: { size: 300_000, type: "image/jpeg" },
    thumb: { size: 50_000, type: "image/jpeg" },
    ...overrides,
  };
  const keys = { original: `originals/${MATCH}/${PHOTO}`, preview: `media/${MATCH}/${PHOTO}-preview.jpg`, thumb: `media/${MATCH}/${PHOTO}-thumb.jpg` };
  for (const [variant, file] of Object.entries(files)) {
    if (file) state.objects.set(keys[variant as keyof typeof keys], { size: file.size, httpMetadata: { contentType: file.type } });
  }
};

beforeEach(() => {
  state.objects.clear();
  state.deleted = [];
  state.publishedRows = 1;
  state.updates = 0;
});

describe("upload complete", () => {
  it("publishes when the three stored files match the reservation exactly", async () => {
    store();
    const response = await call();
    expect(response.status).toBe(200);
    expect(state.updates).toBe(1);
    expect(state.deleted).toEqual([]);
  });

  it("rejects and removes a stored file whose size differs from the reservation", async () => {
    store({ original: { size: 31_000_000, type: "image/jpeg" } });
    expect((await call()).status).toBe(409);
    expect(state.updates).toBe(0);
    expect(state.deleted).toEqual([`originals/${MATCH}/${PHOTO}`]);
  });

  it("rejects and removes files with a non-image (or non-JPEG public) type", async () => {
    store({ original: { size: 30_000_000, type: "text/html" }, thumb: { size: 50_000, type: "image/png" } });
    expect((await call()).status).toBe(409);
    expect(state.deleted.sort()).toEqual([`media/${MATCH}/${PHOTO}-thumb.jpg`, `originals/${MATCH}/${PHOTO}`].sort());
  });

  it("rejects an incomplete upload (a file is missing) without publishing", async () => {
    store({ preview: null });
    expect((await call()).status).toBe(409);
    expect(state.updates).toBe(0);
  });

  it("does not report success if the stale-upload cleanup claimed the photo first", async () => {
    store();
    state.publishedRows = 0; // conditional update matched nothing
    expect((await call()).status).toBe(409);
  });
});
