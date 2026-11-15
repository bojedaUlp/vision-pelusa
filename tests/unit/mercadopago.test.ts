import { afterEach, describe, expect, it, vi } from "vitest";
import { createMercadoPagoPreference, formatMercadoPagoDate, getPreferenceExpirationHours } from "@/lib/mercadopago";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Mercado Pago preference expiration", () => {
  it("formats dates like the Mercado Pago docs: ISO 8601 with an explicit offset (Argentina, -03:00)", () => {
    expect(formatMercadoPagoDate(new Date("2026-11-18T15:30:00.000Z"))).toBe("2026-11-18T12:30:00.000-03:00");
  });

  it("reads MP_PREFERENCE_EXPIRATION_HOURS (72 approved) and treats empty/invalid as disabled", () => {
    vi.stubEnv("MP_PREFERENCE_EXPIRATION_HOURS", "72");
    expect(getPreferenceExpirationHours()).toBe(72);
    vi.stubEnv("MP_PREFERENCE_EXPIRATION_HOURS", "");
    expect(getPreferenceExpirationHours()).toBeNull();
    vi.stubEnv("MP_PREFERENCE_EXPIRATION_HOURS", "abc");
    expect(getPreferenceExpirationHours()).toBeNull();
  });

  it("sends expires + expiration window + cash ticket deadline when an expiration is given", async () => {
    vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "TEST-token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "pref-1", init_point: "https://mp.test/checkout" })));
    vi.stubGlobal("fetch", fetchMock);

    const expiresAt = new Date("2026-11-21T15:00:00.000Z");
    await createMercadoPagoPreference({
      items: [{ id: "p", title: "Foto", quantity: 1, unit_price: 1500 }],
      payerEmail: "a@b.test",
      externalReference: "purchase-1",
      metadata: {},
      backUrl: "https://visionpelusa.com/compras",
      expiresAt,
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({
      expires: true,
      expiration_date_to: "2026-11-21T12:00:00.000-03:00",
      date_of_expiration: "2026-11-21T12:00:00.000-03:00",
    });
    expect(body.expiration_date_from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/);
  });

  it("sends no expiration fields when expiration is disabled", async () => {
    vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "TEST-token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "pref-1", init_point: "https://mp.test/checkout" })));
    vi.stubGlobal("fetch", fetchMock);
    await createMercadoPagoPreference({
      items: [{ id: "p", title: "Foto", quantity: 1, unit_price: 1500 }],
      payerEmail: "a@b.test",
      externalReference: "purchase-1",
      metadata: {},
      backUrl: "https://visionpelusa.com/compras",
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.expires).toBeUndefined();
    expect(body.date_of_expiration).toBeUndefined();
  });
});
