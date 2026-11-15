import { afterEach, describe, expect, it, vi } from "vitest";

// reconcileUnresolvedPurchases: a 'pending'/'failed' purchase stops protecting its photos only
// when Mercado Pago proves it can no longer be paid.
const PURCHASE = "30000000-0000-4000-8000-000000000001";
const hourAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

async function load(purchase: Record<string, unknown>, payments: Array<{ id: number; status: string }>) {
  const updates: unknown[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "in", "eq"]) builder[method] = () => builder;
  builder.update = (values: unknown) => {
    updates.push(values);
    return builder;
  };
  builder.then = (resolve: (value: unknown) => void) => resolve({ data: [{ purchases: { id: PURCHASE, ...purchase } }], error: null });

  vi.doMock("@/lib/supabase-admin", () => ({
    getSupabaseAdmin: () => ({ from: () => builder }),
    SupabaseAdminConfigError: class extends Error {},
  }));
  const search = vi.fn(async () => payments);
  vi.doMock("@/lib/mercadopago", () => ({
    searchMercadoPagoPaymentsByReference: search,
    getMercadoPagoPayment: vi.fn(async () => null),
    getPreferenceExpirationHours: () => null,
    isValidPaymentId: (v: unknown) => typeof v === "string" && /^\d+$/.test(v),
    createMercadoPagoPreference: vi.fn(),
  }));
  const mod = await import("@/lib/purchases-server");
  return { reconcile: mod.reconcileUnresolvedPurchases, updates, search };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase-admin");
  vi.doUnmock("@/lib/mercadopago");
});

describe("reconcileUnresolvedPurchases", () => {
  it("keeps protecting a checkout whose preference does not expire (no expiration configured)", async () => {
    const t = await load({ status: "pending", created_at: hourAgo(200), expires_at: null, mercado_pago_preference_id: "p1" }, []);
    expect(await t.reconcile(["x"])).toMatchObject({ released: 0 });
    expect(t.search).not.toHaveBeenCalled();
  });

  it("keeps protecting an expired preference that still has a payment in process (late credit)", async () => {
    const t = await load(
      { status: "pending", created_at: hourAgo(100), expires_at: hourAgo(25), mercado_pago_preference_id: "p1" },
      [{ id: 1, status: "in_process" }],
    );
    expect(await t.reconcile(["x"])).toMatchObject({ released: 0 });
    expect(t.updates).toHaveLength(0);
  });

  it("releases an expired preference with no approved or in-process payment", async () => {
    const t = await load(
      { status: "failed", created_at: hourAgo(100), expires_at: hourAgo(25), mercado_pago_preference_id: "p1" },
      [{ id: 1, status: "rejected" }],
    );
    expect(await t.reconcile(["x"])).toMatchObject({ released: 1 });
    expect(t.updates).toEqual([{ status: "expired" }]);
  });

  it("waits 24 h after the preference expired before releasing (late credits of cash payments)", async () => {
    const t = await load(
      { status: "pending", created_at: hourAgo(80), expires_at: hourAgo(8), mercado_pago_preference_id: "p1" },
      [],
    );
    expect(await t.reconcile(["x"])).toMatchObject({ released: 0 });
    expect(t.search).not.toHaveBeenCalled();
  });

  it("releases an old checkout that never reached Mercado Pago, but not one in progress", async () => {
    const old = await load({ status: "failed", created_at: hourAgo(3), expires_at: null, mercado_pago_preference_id: null }, []);
    expect(await old.reconcile(["x"])).toMatchObject({ released: 1 });
    vi.resetModules();
    const fresh = await load({ status: "pending", created_at: new Date().toISOString(), expires_at: null, mercado_pago_preference_id: null }, []);
    expect(await fresh.reconcile(["x"])).toMatchObject({ released: 0 });
  });
});
