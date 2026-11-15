import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { protectedImageUrl } from "./protected-images";
import { getSupabaseAdmin, SupabaseAdminConfigError } from "./supabase-admin";
import { getPriceForCount } from "./mock-data";
import {
  createMercadoPagoPreference,
  getMercadoPagoPayment,
  getPreferenceExpirationHours,
  isValidPaymentId,
  searchMercadoPagoPaymentsByReference,
} from "./mercadopago";

// Download window after payment (shown to buyers). Albums are weekly: once every download right
// of a photo expired, the admin may delete its files.
export const DOWNLOAD_ACCESS_DAYS = 7;
const MAX_PHOTOS_PER_PURCHASE = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PurchaseFlowError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

export const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const isValidEmail = (value: string) => EMAIL_RE.test(value) && value.length <= 254;

const getAppUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://visionpelusa.com").trim().replace(/\/+$/, "");

// ilike without wildcards = case-insensitive exact match; escape LIKE metacharacters in the email.
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function fail(context: string, error: unknown): never {
  console.error(`[purchases] ${context}`, error);
  throw error instanceof Error ? error : new Error(`${context}: ${JSON.stringify(error)}`);
}

/* -------------------------------------------------------------------------- */
/* Checkout                                                                   */
/* -------------------------------------------------------------------------- */

export class CheckoutStageError extends Error {
  constructor(
    public readonly stage: "CONFIG" | "PHOTOS" | "PURCHASE" | "PURCHASE_ITEMS" | "MERCADO_PAGO" | "PREFERENCE_UPDATE",
    message: string,
    // Safe, value-free identifier (e.g. MISSING_SERVICE_ROLE) that the API may return.
    public readonly code?: string,
  ) {
    super(`[${stage}] ${message}`);
  }
}

// Presence only (booleans), never values. Compares the raw Cloudflare Worker bindings with
// process.env to tell "secret missing in Cloudflare" apart from "not exposed to process.env".
function logConfigPresence() {
  let workerEnv: Record<string, unknown> | null = null;
  try {
    workerEnv = getCloudflareContext().env as unknown as Record<string, unknown>;
  } catch {
    workerEnv = null; // not running inside the Cloudflare request context (e.g. plain next start)
  }

  const inWorker = (key: string) => (workerEnv ? typeof workerEnv[key] === "string" && Boolean(workerEnv[key]) : null);

  console.log("[checkout][CONFIG]", {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    mercadoPagoToken: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
    appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
  });
  console.log("[checkout][CONFIG] cloudflare bindings", {
    contextAvailable: workerEnv !== null,
    supabaseUrl: inWorker("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRole: inWorker("SUPABASE_SERVICE_ROLE_KEY"),
    mercadoPagoToken: inWorker("MERCADO_PAGO_ACCESS_TOKEN"),
  });
}

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "object" && error ? JSON.stringify(error) : String(error);

// Same tiered table the gallery shows (getPriceForCount): 2 photos = $2.900.
// Spread the total over the items in whole pesos so Mercado Pago receives exactly that total.
function splitTotal(total: number, count: number) {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export async function createCheckout(input: { email: unknown; photoIds: unknown }) {
  console.log("[checkout] START");

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new PurchaseFlowError("Ingresá un email válido para confirmar la compra.");
  }

  const rawIds = Array.isArray(input.photoIds) ? input.photoIds : [];
  const photoIds = Array.from(new Set(rawIds.map((id) => String(id ?? "").trim().toLowerCase())));
  console.log("[checkout] photo ids:", photoIds);

  if (photoIds.length === 0) {
    throw new PurchaseFlowError("Seleccioná al menos una foto.");
  }
  if (photoIds.length > MAX_PHOTOS_PER_PURCHASE || !photoIds.every(isUuid)) {
    throw new PurchaseFlowError("La selección de fotos no es válida.");
  }

  // CONFIG: runtime configuration needed by the following stages.
  logConfigPresence();

  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) {
    console.error("[checkout] CONFIG ERROR: CONFIG_MISSING_MP_TOKEN");
    throw new CheckoutStageError("CONFIG", "CONFIG_MISSING_MP_TOKEN", "MISSING_MP_TOKEN");
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    const code = error instanceof SupabaseAdminConfigError ? error.code : "UNKNOWN_CONFIG_ERROR";
    console.error("[checkout] CONFIG ERROR:", code);
    throw new CheckoutStageError("CONFIG", `CONFIG_${code}`, code);
  }

  // ETAPA 1: fotos. Titles and existence come from the database, never from the browser.
  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select("id, title, is_published, matches(status)")
    .in("id", photoIds);

  if (photosError) {
    console.error("[checkout] PHOTOS ERROR:", photosError);
    throw new CheckoutStageError("PHOTOS", `Photos lookup failed: ${photosError.message}`);
  }

  // Photos being deleted are unpublished; only published albums accept purchases (not drafts,
  // archived or deleted). The purchase_items_guard trigger enforces the same rule atomically.
  const photoRows = (photos ?? []) as unknown as Array<{
    id: string;
    title: string;
    is_published: boolean;
    matches: { status: string } | null;
  }>;
  const isBuyable = (photo: (typeof photoRows)[number]) =>
    photo.is_published && photo.matches?.status === "published";
  if (photoRows.length !== photoIds.length || !photoRows.every(isBuyable)) {
    console.error("[checkout] PHOTOS ERROR: requested", photoIds.length, "found", photoRows.length);
    throw new PurchaseFlowError("Alguna de las fotos seleccionadas ya no está disponible.");
  }

  const total = getPriceForCount(photoRows.length);
  const unitPrices = splitTotal(total, photoRows.length);
  console.log("[checkout] total:", total, "unit prices:", unitPrices);

  // ETAPA 2: purchase pending.
  console.log("[checkout] creating purchase");
  const expirationHours = getPreferenceExpirationHours();
  const expiresAt = expirationHours ? new Date(Date.now() + expirationHours * 60 * 60 * 1000) : null;
  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .insert({ buyer_email: email, status: "pending", total_amount: total, expires_at: expiresAt?.toISOString() ?? null })
    .select("id")
    .single();

  if (purchaseError || !purchase) {
    console.error("[checkout] PURCHASE INSERT ERROR:", purchaseError);
    throw new CheckoutStageError("PURCHASE", `Purchase insert failed: ${purchaseError?.message ?? "no row returned"}`);
  }

  const purchaseId = String(purchase.id);
  console.log("[checkout] purchase created:", purchaseId);

  // ETAPA 3: one purchase_items row per photo, with the real photos.id UUID.
  const itemRows = photoRows.map((photo, index) => ({
    purchase_id: purchaseId,
    photo_id: photo.id,
    quantity: 1,
    unit_price: unitPrices[index],
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from("purchase_items")
    .insert(itemRows)
    .select("id");

  if (itemsError || (insertedItems ?? []).length !== itemRows.length) {
    console.error("[checkout] PURCHASE ITEMS ERROR:", itemsError ?? `inserted ${insertedItems?.length ?? 0} of ${itemRows.length}`);
    await supabase.from("purchases").delete().eq("id", purchaseId);
    if (itemsError?.message?.includes("PHOTO_NOT_AVAILABLE")) {
      // Lost the race against an admin deletion/archive: not a server failure.
      throw new PurchaseFlowError("Alguna de las fotos seleccionadas ya no está disponible.");
    }
    throw new CheckoutStageError(
      "PURCHASE_ITEMS",
      `Purchase items insert failed: ${itemsError?.message ?? `inserted ${insertedItems?.length ?? 0} of ${itemRows.length}`}`,
    );
  }
  console.log("[checkout] purchase_items created:", insertedItems?.length);

  // ETAPA 4: Mercado Pago preference.
  const appUrl = getAppUrl();
  let preference: Awaited<ReturnType<typeof createMercadoPagoPreference>>;

  try {
    preference = await createMercadoPagoPreference({
      items: photoRows.map((photo, index) => ({
        id: photo.id,
        title: photo.title || "Foto Visión Pelusa",
        quantity: 1,
        unit_price: unitPrices[index],
      })),
      payerEmail: email,
      externalReference: purchaseId,
      metadata: { purchase_id: purchaseId },
      backUrl: `${appUrl}/compras?email=${encodeURIComponent(email)}`,
      // Mercado Pago only accepts public https notification URLs.
      notificationUrl: appUrl.startsWith("https://") ? `${appUrl}/api/payments/webhook` : undefined,
      expiresAt: expiresAt ?? undefined,
    });
  } catch (error) {
    console.error("[checkout] MERCADO PAGO ERROR:", describeError(error));
    await supabase.from("purchases").update({ status: "failed" }).eq("id", purchaseId);
    throw new CheckoutStageError("MERCADO_PAGO", describeError(error));
  }
  console.log("[checkout] preference created:", preference.preferenceId);

  const { error: prefError } = await supabase
    .from("purchases")
    .update({ mercado_pago_preference_id: preference.preferenceId })
    .eq("id", purchaseId);

  if (prefError) {
    console.error("[checkout] PREFERENCE UPDATE ERROR:", prefError);
    await supabase.from("purchases").update({ status: "failed" }).eq("id", purchaseId);
    throw new CheckoutStageError("PREFERENCE_UPDATE", `Preference id update failed: ${prefError.message}`);
  }

  console.log("[checkout] DONE", { purchaseId, total });
  return { purchaseId, total, checkoutUrl: preference.checkoutUrl };
}

/* -------------------------------------------------------------------------- */
/* Payment confirmation (webhook + return page)                               */
/* -------------------------------------------------------------------------- */

export type ConfirmResult =
  | { state: "approved"; purchaseId: string }
  | { state: "pending"; paymentStatus: string }
  | { state: "rejected"; paymentStatus: string }
  | { state: "invalid"; reason: string };

const PENDING_PAYMENT_STATUSES = new Set(["pending", "in_process", "authorized", "in_mediation"]);

/**
 * Idempotent: Mercado Pago may notify several times and the return page also calls this.
 * Every step can be re-run safely, so a partial failure is completed on the next call.
 */
export async function confirmPayment(paymentId: unknown): Promise<ConfirmResult> {
  if (!isValidPaymentId(paymentId)) {
    return { state: "invalid", reason: "payment_id inválido" };
  }

  const payment = await getMercadoPagoPayment(paymentId);
  if (!payment) {
    return { state: "invalid", reason: "Mercado Pago no reconoce el pago" };
  }

  const purchaseId = String(payment.external_reference ?? payment.metadata?.purchase_id ?? "");
  if (!isUuid(purchaseId)) {
    return { state: "invalid", reason: "El pago no corresponde a una compra de Visión Pelusa" };
  }

  const supabase = getSupabaseAdmin();

  if (payment.status !== "approved") {
    if (!PENDING_PAYMENT_STATUSES.has(payment.status)) {
      const { error } = await supabase
        .from("purchases")
        .update({ status: "failed" })
        .eq("id", purchaseId)
        .eq("status", "pending");
      if (error) fail("mark purchase failed", error);
      return { state: "rejected", paymentStatus: payment.status };
    }
    return { state: "pending", paymentStatus: payment.status };
  }

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, status, total_amount, mercado_pago_payment_id")
    .eq("id", purchaseId)
    .maybeSingle();

  if (purchaseError) fail("purchase lookup failed", purchaseError);
  if (!purchase) {
    return { state: "invalid", reason: "La compra referenciada no existe" };
  }

  const paidAmount = Number(payment.transaction_amount ?? 0);
  if (payment.currency_id !== "ARS" || paidAmount + 0.001 < Number(purchase.total_amount)) {
    console.error("[purchases] amount mismatch", { paymentId, purchaseId, paidAmount, expected: purchase.total_amount });
    return { state: "invalid", reason: "El monto pagado no coincide con la compra" };
  }

  if (purchase.mercado_pago_payment_id && purchase.mercado_pago_payment_id !== paymentId) {
    console.error("[purchases] purchase already paid by another payment", { paymentId, purchase });
    return { state: "invalid", reason: "La compra ya fue pagada con otro pago" };
  }

  if (purchase.status !== "paid") {
    // Conditional update: only one concurrent caller flips the row; UNIQUE(mercado_pago_payment_id)
    // guarantees the same payment can never authorize two purchases.
    const { error: updateError } = await supabase
      .from("purchases")
      .update({
        status: "paid",
        paid_at: payment.date_approved ?? new Date().toISOString(),
        mercado_pago_payment_id: paymentId,
      })
      .eq("id", purchaseId)
      .neq("status", "paid");

    if (updateError) fail("purchase update to paid failed", updateError);

    const { data: current, error: recheckError } = await supabase
      .from("purchases")
      .select("status, mercado_pago_payment_id")
      .eq("id", purchaseId)
      .single();

    if (recheckError) fail("purchase recheck failed", recheckError);
    if (current.status !== "paid" || current.mercado_pago_payment_id !== paymentId) {
      return { state: "invalid", reason: "La compra ya fue pagada con otro pago" };
    }
  }

  await ensureDownloadAccess(purchaseId);

  return { state: "approved", purchaseId };
}

async function ensureDownloadAccess(purchaseId: string) {
  const supabase = getSupabaseAdmin();

  const { data: items, error: itemsError } = await supabase
    .from("purchase_items")
    .select("photo_id")
    .eq("purchase_id", purchaseId)
    .not("photo_id", "is", null);

  if (itemsError) fail("purchase_items lookup failed", itemsError);
  if (!items || items.length === 0) {
    fail("purchase has no items", new Error(`La compra ${purchaseId} no tiene fotos asociadas.`));
  }

  const expiresAt = new Date(Date.now() + DOWNLOAD_ACCESS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: accessError } = await supabase.from("download_access").upsert(
    items.map((item) => ({
      purchase_id: purchaseId,
      photo_id: item.photo_id,
      expires_at: expiresAt,
    })),
    { onConflict: "purchase_id,photo_id", ignoreDuplicates: true },
  );

  if (accessError) fail("download_access upsert failed", accessError);
}

/* -------------------------------------------------------------------------- */
/* Mis fotos                                                                  */
/* -------------------------------------------------------------------------- */

type PurchaseRow = {
  id: string;
  buyer_email: string;
  status: string;
  total_amount: number;
  created_at: string;
  paid_at: string | null;
  purchase_items: Array<{
    id: string;
    photo_id: string | null;
    unit_price: number;
    quantity: number;
    photos: { id: string; title: string; watermark_url: string | null; sort_order: number; status: string } | null;
  }>;
  download_access: Array<{ photo_id: string | null; expires_at: string | null }> | null;
};

export type PurchasedPhoto = {
  id: string;
  number: number;
  title: string;
  previewUrl: string | null;
  unitPrice: number;
  // false once the album was cleaned up after the download window.
  available: boolean;
};

export type PaidPurchase = {
  id: string;
  total: number;
  createdAt: string;
  paidAt: string | null;
  // Downloads are available until this date (null = no expiry recorded).
  downloadExpiresAt: string | null;
  photos: PurchasedPhoto[];
};

const PURCHASE_SELECT =
  "id, buyer_email, status, total_amount, created_at, paid_at, purchase_items(id, photo_id, unit_price, quantity, photos(id, title, watermark_url, sort_order, status)), download_access(photo_id, expires_at)";

// The original's location is never exposed: originals only leave through /api/download.
function toPaidPurchase(row: PurchaseRow): PaidPurchase {
  const photos = (row.purchase_items ?? [])
    .filter((item) => item.photo_id && item.photos)
    .sort((a, b) => (a.photos?.sort_order ?? 0) - (b.photos?.sort_order ?? 0))
    .map((item, index) => ({
      id: String(item.photo_id),
      number: index + 1,
      title: item.photos?.title ?? `Foto ${index + 1}`,
      previewUrl: protectedImageUrl(item.photos?.watermark_url) ?? null,
      unitPrice: Number(item.unit_price ?? 0),
      available: item.photos?.status === "active" || item.photos?.status === "pending_deletion",
    }));

  const expiries = (row.download_access ?? []).map((access) => access.expires_at).filter((value): value is string => Boolean(value));
  const downloadExpiresAt = expiries.length ? expiries.sort().at(-1) ?? null : null;

  return {
    id: row.id,
    total: Number(row.total_amount ?? 0),
    createdAt: row.created_at,
    paidAt: row.paid_at,
    downloadExpiresAt,
    photos,
  };
}

/**
 * Knowing an email is not proof of owning it, and the result carries download links. The caller
 * must also present the Mercado Pago operation number (payment id) of one paid purchase made
 * with that email: it comes back in the return URL and in Mercado Pago's receipt. Same empty
 * answer for "wrong pair" and "no purchases", so neither emails nor payment ids can be probed.
 */
export async function listPaidPurchasesByEmail(emailInput: unknown, paymentIdInput: unknown): Promise<PaidPurchase[]> {
  const email = normalizeEmail(emailInput);
  const paymentId = String(paymentIdInput ?? "").trim();
  if (!isValidEmail(email) || !isValidPaymentId(paymentId)) return [];

  const { data: proof, error: proofError } = await getSupabaseAdmin()
    .from("purchases")
    .select("id")
    .ilike("buyer_email", escapeLike(email))
    .eq("mercado_pago_payment_id", paymentId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (proofError) fail("purchase ownership lookup failed", proofError);
  if (!proof) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("purchases")
    .select(PURCHASE_SELECT)
    .ilike("buyer_email", escapeLike(email))
    .eq("status", "paid")
    .order("created_at", { ascending: false });

  if (error) fail("paid purchases lookup failed", error);

  return ((data ?? []) as unknown as PurchaseRow[]).map(toPaidPurchase);
}

export async function getPaidPurchase(purchaseId: unknown): Promise<PaidPurchase | null> {
  if (!isUuid(purchaseId)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("purchases")
    .select(PURCHASE_SELECT)
    .eq("id", purchaseId)
    .eq("status", "paid")
    .maybeSingle();

  if (error) fail("purchase detail lookup failed", error);

  return data ? toPaidPurchase(data as unknown as PurchaseRow) : null;
}

/* -------------------------------------------------------------------------- */
/* Downloads                                                                  */
/* -------------------------------------------------------------------------- */

export type OriginalDownload = { body: ReadableStream; size: number; contentType: string; fileName: string };

const safeFileName = (title: string, photoId: string) => {
  const base = title.replace(/[^\w.\- ]+/g, "_").trim() || photoId;
  return /\.(jpe?g|png|webp|heic)$/i.test(base) ? base : `${base}.jpg`;
};

/**
 * Authorizes a purchased download and returns the ORIGINAL from the private R2 bucket. The original
 * is streamed by the Worker; there is no public or signed URL to it.
 */
export async function getOriginalDownload(input: {
  purchaseId: unknown;
  photoId: unknown;
  originals: { get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null> };
}): Promise<OriginalDownload> {
  const { purchaseId, photoId } = input;
  if (!isUuid(purchaseId) || !isUuid(photoId)) {
    throw new PurchaseFlowError("Solicitud de descarga inválida.", 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, status")
    .eq("id", purchaseId)
    .maybeSingle();
  if (purchaseError) fail("download purchase lookup failed", purchaseError);
  if (!purchase || purchase.status !== "paid") {
    throw new PurchaseFlowError("La compra no existe o no está pagada.", 403);
  }

  const { data: item, error: itemError } = await supabase
    .from("purchase_items")
    .select("id")
    .eq("purchase_id", purchaseId)
    .eq("photo_id", photoId)
    .limit(1)
    .maybeSingle();
  if (itemError) fail("download item lookup failed", itemError);
  if (!item) {
    throw new PurchaseFlowError("Esta foto no forma parte de la compra.", 403);
  }

  const { data: access, error: accessError } = await supabase
    .from("download_access")
    .select("expires_at")
    .eq("purchase_id", purchaseId)
    .eq("photo_id", photoId)
    .maybeSingle();
  if (accessError) fail("download_access lookup failed", accessError);
  if (!access) {
    throw new PurchaseFlowError("No hay acceso de descarga registrado para esta foto.", 403);
  }
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) {
    throw new PurchaseFlowError("El plazo de descarga de esta foto venció.", 410);
  }

  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .select("id, title, original_key, status")
    .eq("id", photoId)
    .maybeSingle();
  if (photoError) fail("download photo lookup failed", photoError);
  if (!photo?.original_key || photo.status === "deleted") {
    throw new PurchaseFlowError("Esta foto ya no está disponible.", 410);
  }

  const object = await input.originals.get(photo.original_key);
  if (!object) {
    console.error("[download] original missing in R2", { photoId });
    throw new PurchaseFlowError("No encontramos el archivo original de esta foto.", 404);
  }

  return {
    body: object.body,
    size: object.size,
    contentType: object.httpMetadata?.contentType || "image/jpeg",
    fileName: safeFileName(String(photo.title ?? ""), photo.id),
  };
}

/* -------------------------------------------------------------------------- */
/* Reconciliation of unresolved purchases before deleting photos              */
/* -------------------------------------------------------------------------- */

const MP_PENDING_STATUSES = new Set(["pending", "in_process", "authorized", "in_mediation"]);
const MAX_RECONCILE_PER_CALL = 20;
const CHECKOUT_MAX_DURATION_MS = 60 * 60 * 1000;
// A payment made right before the preference expired may be credited later (Mercado Pago does not
// document this case); wait this long after expiration before releasing the purchase.
export const EXPIRED_PREFERENCE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Photos linked to 'pending'/'failed' purchases stay protected. A purchase is released
 * ('expired') only when Mercado Pago proves it can no longer be paid:
 *   - it never got a preference (checkout failed before Mercado Pago), or
 *   - its preference expired (purchases.expires_at passed) AND Mercado Pago has no approved
 *     or in-progress payment for it.
 * An approved payment found here is confirmed (the buyer gets the download, photo stays protected).
 * Without preference expiration (MP_PREFERENCE_EXPIRATION_HOURS unset) a started checkout
 * keeps protecting its photos: deleting them could leave a later payment without its photo.
 */
export async function reconcileUnresolvedPurchases(photoIds: string[]) {
  if (!photoIds.length) return { checked: 0, released: 0, confirmed: 0 };
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("purchase_items")
    .select("purchase_id, purchases!inner(id, status, created_at, expires_at, mercado_pago_preference_id)")
    .in("photo_id", photoIds)
    .in("purchases.status", ["pending", "failed"]);
  if (error) fail("unresolved purchases lookup failed", error);

  type Row = {
    purchases: { id: string; status: string; created_at: string; expires_at: string | null; mercado_pago_preference_id: string | null };
  };
  const purchases = new Map<string, Row["purchases"]>();
  for (const row of (data ?? []) as unknown as Row[]) purchases.set(row.purchases.id, row.purchases);

  let checked = 0;
  let released = 0;
  let confirmed = 0;
  for (const purchase of purchases.values()) {
    // A checkout in progress has no preference for a few seconds: only an old one is abandoned.
    const neverReachedMercadoPago =
      !purchase.mercado_pago_preference_id && Date.now() - new Date(purchase.created_at).getTime() > CHECKOUT_MAX_DURATION_MS;
    const preferenceExpired =
      purchase.expires_at !== null && new Date(purchase.expires_at).getTime() + EXPIRED_PREFERENCE_GRACE_MS <= Date.now();
    if (!neverReachedMercadoPago && !preferenceExpired) continue;
    if (checked >= MAX_RECONCILE_PER_CALL) break;
    checked += 1;

    if (!neverReachedMercadoPago) {
      const payments = await searchMercadoPagoPaymentsByReference(purchase.id);
      const approved = payments.find((payment) => payment.status === "approved");
      if (approved) {
        const result = await confirmPayment(String(approved.id));
        if (result.state === "approved") confirmed += 1;
        continue;
      }
      if (payments.some((payment) => MP_PENDING_STATUSES.has(payment.status))) continue;
    }

    const { error: updateError } = await supabase
      .from("purchases")
      .update({ status: "expired" })
      .eq("id", purchase.id)
      .in("status", ["pending", "failed"]);
    if (updateError) fail("expire purchase failed", updateError);
    released += 1;
  }
  return { checked, released, confirmed };
}
