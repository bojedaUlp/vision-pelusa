import "server-only";

// Overridable ONLY for local tests (a mock server). Never set MERCADO_PAGO_API_URL in production.
const MP_API = (process.env.MERCADO_PAGO_API_URL ?? "").trim().replace(/\/+$/, "") || "https://api.mercadopago.com";

export type MercadoPagoPayment = {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string | null;
  metadata?: Record<string, unknown> | null;
  payer?: { email?: string | null } | null;
};

export type MercadoPagoPreferenceInput = {
  items: Array<{ id: string; title: string; quantity: number; unit_price: number }>;
  payerEmail: string;
  externalReference: string;
  metadata: Record<string, string>;
  backUrl: string;
  notificationUrl?: string;
  // When set, Mercado Pago rejects new payments for this preference after this date.
  expiresAt?: Date;
};

function getAccessToken() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("Mercado Pago no está configurado: falta MERCADO_PAGO_ACCESS_TOKEN.");
  }
  return token;
}

export function isValidPaymentId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,30}$/.test(value);
}

// Preference expiration in hours (MP_PREFERENCE_EXPIRATION_HOURS). Disabled (null) by default:
// enabling it is a commercial decision. Without it, abandoned checkouts keep protecting photos.
export function getPreferenceExpirationHours(): number | null {
  const hours = Number(process.env.MP_PREFERENCE_EXPIRATION_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

/**
 * Source of truth for a payment. Returns null when Mercado Pago does not know the id (404);
 * throws on any other failure so callers never mistake an outage for "not approved".
 */
export async function getMercadoPagoPayment(paymentId: string): Promise<MercadoPagoPayment | null> {
  if (!isValidPaymentId(paymentId)) return null;

  const response = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    cache: "no-store",
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Mercado Pago GET /v1/payments/${paymentId} falló (${response.status}): ${detail}`);
  }

  return (await response.json()) as MercadoPagoPayment;
}

// All payments Mercado Pago has for one purchase (external_reference = purchases.id).
// Throws on failure: an outage must never be read as "no payments".
export async function searchMercadoPagoPaymentsByReference(externalReference: string): Promise<MercadoPagoPayment[]> {
  const url = `${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&limit=100`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Mercado Pago payments search falló (${response.status}): ${detail}`);
  }
  const data = (await response.json()) as { results?: MercadoPagoPayment[] };
  return Array.isArray(data.results) ? data.results : [];
}

export async function createMercadoPagoPreference(input: MercadoPagoPreferenceInput) {
  const response = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: input.items.map((item) => ({ ...item, currency_id: "ARS" })),
      payer: { email: input.payerEmail },
      external_reference: input.externalReference,
      metadata: input.metadata,
      back_urls: {
        success: input.backUrl,
        pending: input.backUrl,
        failure: input.backUrl,
      },
      auto_return: "approved",
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      ...(input.expiresAt
        ? {
            expires: true,
            expiration_date_from: new Date().toISOString(),
            expiration_date_to: input.expiresAt.toISOString(),
            date_of_expiration: input.expiresAt.toISOString(),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[MercadoPago] preference failed", response.status, text);
    throw new Error(`Mercado Pago POST /checkout/preferences falló (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { id: string; init_point?: string; sandbox_init_point?: string };
  const checkoutUrl = data.init_point ?? data.sandbox_init_point ?? "";
  if (!checkoutUrl) {
    console.error("[MercadoPago] preference without init_point", data.id);
    throw new Error(`Mercado Pago no devolvió init_point para la preferencia ${data.id}`);
  }

  return { preferenceId: data.id, checkoutUrl };
}
