import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminAuthError, requireAdmin } from "@/lib/admin-server";

function authClient(user: { id: string } | null, isAdmin: boolean | null) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : { message: "invalid" } })) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: isAdmin === null ? null : { is_admin: isAdmin }, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const req = (authorization?: string) =>
  new Request("https://x.test/api/admin/deletions/execute", { method: "POST", headers: authorization ? { authorization } : {} });

describe("requireAdmin", () => {
  it("rejects requests without a token (401)", async () => {
    await expect(requireAdmin(req(), authClient(null, null))).rejects.toMatchObject({ status: 401 });
  });

  it("rejects invalid or expired tokens (401)", async () => {
    await expect(requireAdmin(req("Bearer bad"), authClient(null, null))).rejects.toBeInstanceOf(AdminAuthError);
  });

  it("rejects authenticated users that are not admins (403)", async () => {
    await expect(requireAdmin(req("Bearer ok"), authClient({ id: "u1" }, false))).rejects.toMatchObject({ status: 403 });
    await expect(requireAdmin(req("Bearer ok"), authClient({ id: "u1" }, null))).rejects.toMatchObject({ status: 403 });
  });

  it("accepts admins", async () => {
    await expect(requireAdmin(req("Bearer ok"), authClient({ id: "u1" }, true))).resolves.toMatchObject({ userId: "u1" });
  });
});

// GET /api/purchases: an email alone no longer returns purchases (download links).
describe("listPaidPurchasesByEmail", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase-admin");
  });

  async function load(proofFound: boolean) {
    const queries: string[] = [];
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "ilike", "eq", "limit", "order"]) {
      builder[method] = (...args: unknown[]) => {
        queries.push(`${method}:${JSON.stringify(args)}`);
        return builder;
      };
    }
    builder.maybeSingle = async () => ({ data: proofFound ? { id: "p1" } : null, error: null });
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
    vi.doMock("@/lib/supabase-admin", () => ({
      getSupabaseAdmin: () => ({ from: () => builder }),
      SupabaseAdminConfigError: class extends Error {},
    }));
    const mod = await import("@/lib/purchases-server");
    return { list: mod.listPaidPurchasesByEmail, queries };
  }

  it("returns nothing and does not query without an operation number", async () => {
    const { list, queries } = await load(true);
    expect(await list("buyer@example.com", "")).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it("returns nothing when email and operation number do not match a paid purchase", async () => {
    const { list, queries } = await load(false);
    expect(await list("buyer@example.com", "123456789")).toEqual([]);
    expect(queries.some((q) => q.includes("mercado_pago_payment_id"))).toBe(true);
  });

  it("lists purchases once the pair is proven", async () => {
    const { list } = await load(true);
    expect(await list("buyer@example.com", "123456789")).toEqual([]);
  });
});
