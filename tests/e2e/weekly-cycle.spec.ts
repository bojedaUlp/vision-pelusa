import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Full weekly cycle against the LOCAL stack (see playwright.config.ts). Throwaway data only.
test.describe.configure({ mode: "serial" });

const env = (name: string) => process.env[name] as string;
const db = () => createClient(env("E2E_SUPABASE_URL"), env("E2E_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const runId = Date.now();
const slug = `e2e-fecha-${runId}`;
const buyerEmail = `comprador-${runId}@test.local`;
const files = ["e2e-1.jpg", "e2e-2.jpg", "e2e-3.jpg"];

let adminContext: BrowserContext;
let admin: Page;
let supabase: SupabaseClient;
let albumId = "";
const photos: Record<string, { id: string; original_key: string; thumbnail_url: string; original_bytes: number }> = {};
let paidPurchaseId = "";
let paidPaymentId = "";
let pendingPurchaseId = "";

async function makeJpegs(page: Page) {
  // Real JPEGs generated in the browser (noise so they have a realistic size).
  const encoded = await page.evaluate(async (count) => {
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 800;
      const ctx = canvas.getContext("2d")!;
      const image = ctx.createImageData(1200, 800);
      for (let p = 0; p < image.data.length; p += 4) {
        image.data[p] = (p * (i + 3)) % 255;
        image.data[p + 1] = Math.random() * 255;
        image.data[p + 2] = 90 + i * 40;
        image.data[p + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      out.push(btoa(binary));
    }
    return out;
  }, files.length);
  return encoded.map((base64, index) => ({ name: files[index], mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") }));
}

async function tokenFor(email: string, password: string) {
  const client = createClient(env("E2E_SUPABASE_URL"), env("E2E_ANON_KEY"), { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign in failed: ${error?.message}`);
  return data.session.access_token;
}

// Active photos in the whole (local) database, from the admin storage endpoint.
let baselinePhotos = 0;
async function activePhotos(request: APIRequestContext) {
  const token = await tokenFor(env("E2E_ADMIN_EMAIL"), env("E2E_ADMIN_PASSWORD"));
  const usage = await (await request.get("/api/admin/storage", { headers: { Authorization: `Bearer ${token}` } })).json();
  return Number(usage.photos);
}

async function newAnonPage(browser: Browser, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  return { context, page: await context.newPage() };
}

test.beforeAll(async ({ browser }) => {
  supabase = db();
  adminContext = await browser.newContext();
  admin = await adminContext.newPage();
});

test.afterAll(async () => {
  await adminContext?.close();
});

test("1. admin logs in", async ({ request }) => {
  baselinePhotos = await activePhotos(request);
  await admin.goto("/admin");
  await admin.getByPlaceholder("admin@tu-dominio.com").fill(env("E2E_ADMIN_EMAIL"));
  await admin.getByPlaceholder("Ingresá tu contraseña").fill(env("E2E_ADMIN_PASSWORD"));
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin.getByRole("heading", { name: "Mis galerías" })).toBeVisible();
  await expect(admin.getByTestId("storage-indicator")).toContainText("de 20,0 MB");
});

test("2. admin creates an album and bulk-uploads photos (watermark + thumbnail generated, stored in R2)", async ({ request }) => {
  await admin.getByLabel("Título del partido").fill(`E2E Fecha ${runId}`);
  await admin.getByLabel("Slug").fill(slug);
  await admin.getByRole("button", { name: "Crear galería" }).click();
  await expect(admin.getByText(/Galería .* creada/)).toBeVisible();

  await admin.locator('input[type="file"]').setInputFiles(await makeJpegs(admin));
  await admin.getByRole("button", { name: "Subir fotos" }).click();
  await expect(admin.getByText("Se cargaron 3 imágenes correctamente.")).toBeVisible({ timeout: 120_000 });

  const { data: album } = await supabase.from("matches").select("id").eq("slug", slug).single();
  albumId = album!.id;
  const { data: rows } = await supabase
    .from("photos")
    .select("id, title, status, is_published, original_key, watermark_url, thumbnail_url, original_bytes, preview_bytes, thumb_bytes")
    .eq("match_id", albumId);
  expect(rows).toHaveLength(3);
  for (const row of rows!) {
    expect(row).toMatchObject({ status: "active", is_published: true });
    expect(row.original_key).toBe(`${albumId}/${row.id}`);
    expect(row.thumbnail_url).toBe(`/media/${albumId}/${row.id}-thumb.jpg`);
    expect(row.preview_bytes).toBeLessThan(row.original_bytes);
    photos[row.title] = row;
  }
  await expect(admin.getByTestId("storage-indicator")).toContainText(`${baselinePhotos + 3} fotos`);
  expect(await activePhotos(request)).toBe(baselinePhotos + 3);
});

let heroUrl = "";
test("2b. admin generates the album's Home image (hero) from an original, stored in the public bucket", async ({ request }) => {
  await admin.getByRole("row", { name: new RegExp(`E2E Fecha ${runId}`) }).getByRole("button", { name: "Editar" }).click();
  await admin.getByTitle("Foto 1 · e2e-1.jpg").click();
  await admin.getByRole("button", { name: "Generar imagen para la Home" }).click();
  await expect(admin.getByText("Imagen para la Home actualizada.")).toBeVisible({ timeout: 60_000 });

  const { data } = await supabase.from("matches").select("hero_url, hero_bytes").eq("id", albumId).single();
  heroUrl = data!.hero_url;
  expect(heroUrl).toMatch(new RegExp(`^/media/${albumId}/hero-\\d+\\.jpg$`));
  expect(Number(data!.hero_bytes)).toBeGreaterThan(0);
  expect((await request.get(heroUrl)).status()).toBe(200);
});

test("3. public gallery shows watermarked media; originals are never reachable publicly", async ({ browser, request }) => {
  const { context, page } = await newAnonPage(browser);
  await page.goto(`/galeria/${slug}`);
  await expect(page.locator('img[alt="e2e-1.jpg"]')).toBeVisible();

  const thumb = await request.get(photos["e2e-1.jpg"].thumbnail_url);
  expect(thumb.status()).toBe(200);
  expect(thumb.headers()["content-type"]).toBe("image/jpeg");

  // The original key does not exist in the public bucket, and the media route cannot reach the private one.
  expect((await request.get(`/media/${photos["e2e-1.jpg"].original_key}`)).status()).toBe(404);
  expect((await request.get(`/media/${albumId}/..%2F..%2Fsecret`)).status()).toBe(404);

  // The browser (anon key) cannot read where originals live.
  const rest = await request.get(`${env("E2E_SUPABASE_URL")}/rest/v1/photos?select=original_key`, {
    headers: { apikey: env("E2E_ANON_KEY"), Authorization: `Bearer ${env("E2E_ANON_KEY")}` },
  });
  expect(rest.ok()).toBe(false);

  // Download without a valid purchase is refused.
  expect((await request.get(`/api/download/${photos["e2e-1.jpg"].id}?purchaseId=${crypto.randomUUID()}`)).status()).toBe(403);
  await context.close();
});

test("4. purchase → Mercado Pago confirmation → authorized download of the original", async ({ browser, request }) => {
  const { context, page } = await newAnonPage(browser);
  await page.goto(`/galeria/${slug}`);
  await page.locator('img[alt="e2e-1.jpg"]').click();
  await page.getByPlaceholder("nombre@correo.com").fill(buyerEmail);
  await expect(page.getByText("tenés 7 días para descargar")).toBeVisible();
  await page.getByRole("button", { name: "Pagar con Mercado Pago" }).click();
  await page.waitForURL(/mock_preference=/);

  const { data: purchase } = await supabase.from("purchases").select("id, status, expires_at").eq("buyer_email", buyerEmail).single();
  expect(purchase!.status).toBe("pending");
  // MP_PREFERENCE_EXPIRATION_HOURS=72: the preference (and its cash tickets) expire in 72 h.
  const hoursLeft = (new Date(purchase!.expires_at).getTime() - Date.now()) / 3600_000;
  expect(hoursLeft).toBeGreaterThan(71.5);
  expect(hoursLeft).toBeLessThanOrEqual(72);
  paidPurchaseId = purchase!.id;

  const pay = await request.post(`${env("E2E_MP_URL")}/__test/pay`, { data: { external_reference: paidPurchaseId, status: "approved" } });
  paidPaymentId = String((await pay.json()).id);

  // Return from Mercado Pago: the payment is verified server-side and the purchase listed.
  await page.goto(`/compras?email=${encodeURIComponent(buyerEmail)}&payment_id=${paidPaymentId}`);
  await expect(page.getByText("Pago confirmado", { exact: true })).toBeVisible();
  await expect(page.getByText(/Descargá tus fotos antes del/)).toBeVisible();

  const download = await request.get(`/api/download/${photos["e2e-1.jpg"].id}?purchaseId=${paidPurchaseId}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect((await download.body()).byteLength).toBe(Number(photos["e2e-1.jpg"].original_bytes));

  // Email alone no longer lists purchases (download links): the operation number is required.
  const leak = await request.get(`/api/purchases?email=${encodeURIComponent(buyerEmail)}`);
  expect((await leak.json()).purchases).toEqual([]);
  await context.close();
});

test("5. a second buyer starts a checkout but does not pay (pending payment)", async ({ browser }) => {
  const { context, page } = await newAnonPage(browser);
  await page.goto(`/galeria/${slug}`);
  await page.locator('img[alt="e2e-2.jpg"]').click();
  await page.getByPlaceholder("nombre@correo.com").fill(`pendiente-${runId}@test.local`);
  await page.getByRole("button", { name: "Pagar con Mercado Pago" }).click();
  await page.waitForURL(/mock_preference=/);
  const { data } = await supabase.from("purchases").select("id, status").eq("buyer_email", `pendiente-${runId}@test.local`).single();
  expect(data!.status).toBe("pending");
  pendingPurchaseId = data!.id;
  await context.close();
});

test("6. admin deletes one unsold photo: files removed from R2, space released", async ({ request }) => {
  const usageBefore = await (await request.get("/api/admin/storage", { headers: { Authorization: `Bearer ${await tokenFor(env("E2E_ADMIN_EMAIL"), env("E2E_ADMIN_PASSWORD"))}` } })).json();

  await admin.getByRole("row", { name: new RegExp(`E2E Fecha ${runId}`) }).getByRole("button", { name: "Fotos" }).click();
  const card = admin.getByTestId("admin-photo").filter({ has: admin.locator('img[alt="e2e-3.jpg"]') });
  await expect(admin.getByTestId("admin-photo").filter({ has: admin.locator('img[alt="e2e-1.jpg"]') })).toContainText("Descarga vigente");
  await expect(admin.getByTestId("admin-photo").filter({ has: admin.locator('img[alt="e2e-2.jpg"]') })).toContainText("Pago pendiente");
  await card.getByRole("button", { name: "Eliminar" }).click();
  await expect(admin.getByRole("dialog")).toContainText("Elegibles para eliminar: 1");
  await admin.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(admin.getByRole("dialog")).toContainText("Eliminadas: 1.");
  await admin.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();

  const { data: row } = await supabase.from("photos").select("status, original_key").eq("id", photos["e2e-3.jpg"].id).single();
  expect(row).toEqual({ status: "deleted", original_key: null });
  expect((await request.get(photos["e2e-3.jpg"].thumbnail_url)).status()).toBe(404);

  const usageAfter = await (await request.get("/api/admin/storage", { headers: { Authorization: `Bearer ${await tokenFor(env("E2E_ADMIN_EMAIL"), env("E2E_ADMIN_PASSWORD"))}` } })).json();
  expect(usageBefore.usedBytes - usageAfter.usedBytes).toBeGreaterThan(Number(photos["e2e-3.jpg"].original_bytes));
});

test("7. deleting the album with an active download and a pending payment archives it and protects both", async ({ browser, request }) => {
  await admin.getByRole("row", { name: new RegExp(`E2E Fecha ${runId}`) }).getByRole("button", { name: "Eliminar" }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toContainText("Con descarga vigente (protegidas): 1");
  await expect(dialog).toContainText("Con pago sin resolver (protegidas): 1");
  await expect(admin.getByRole("button", { name: "Confirmar eliminación" })).toBeDisabled();
  await dialog.getByRole("textbox").fill("ELIMINAR");
  await admin.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(dialog).toContainText("el álbum quedó archivado");
  await admin.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();

  const { data: album } = await supabase.from("matches").select("status").eq("id", albumId).single();
  expect(album!.status).toBe("archived");

  // Hidden from the public and no new purchases, but the buyer keeps downloading.
  const { context, page } = await newAnonPage(browser);
  await page.goto(`/galeria/${slug}`);
  await expect(page.getByText("No se encontró la galería solicitada.")).toBeVisible();
  await context.close();
  expect((await request.get(`/api/download/${photos["e2e-1.jpg"].id}?purchaseId=${paidPurchaseId}`)).status()).toBe(200);
});

test("8. after the download window and the payment expire, the album is fully deleted and storage freed", async ({ request }) => {
  await supabase.from("download_access").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("purchase_id", paidPurchaseId);
  // Simulates an expired Mercado Pago preference with no payment (the mock has none for it).
  await supabase.from("purchases").update({ expires_at: new Date(Date.now() - 25 * 3600_000).toISOString() }).eq("id", pendingPurchaseId); // expired + 24 h grace

  await admin.reload();
  await admin.getByRole("row", { name: new RegExp(`E2E Fecha ${runId}`) }).getByRole("button", { name: "Eliminar" }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toContainText("Vendidas con descarga vencida (se eliminan): 1");
  await expect(dialog).toContainText("Con pago sin resolver (protegidas): 0");
  await dialog.getByRole("textbox").fill("ELIMINAR");
  await admin.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(dialog).toContainText("Eliminadas: 2.");
  await admin.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();

  const { data: album } = await supabase.from("matches").select("status").eq("id", albumId).single();
  expect(album!.status).toBe("deleted");
  const { data: rows } = await supabase.from("photos").select("status").eq("match_id", albumId);
  expect(rows!.every((row) => row.status === "deleted")).toBe(true);
  await expect(admin.getByRole("row", { name: new RegExp(`E2E Fecha ${runId}`) })).toHaveCount(0);

  // Commercial history kept; files gone.
  const { data: purchases } = await supabase.from("purchases").select("id, status").in("id", [paidPurchaseId, pendingPurchaseId]);
  expect(Object.fromEntries(purchases!.map((p) => [p.id, p.status]))).toEqual({ [paidPurchaseId]: "paid", [pendingPurchaseId]: "expired" });
  expect((await request.get(`/api/download/${photos["e2e-1.jpg"].id}?purchaseId=${paidPurchaseId}`)).status()).toBe(410);
  for (const name of files) expect((await request.get(photos[name].thumbnail_url)).status()).toBe(404);
  expect((await request.get(heroUrl)).status()).toBe(404); // the album's Home image is removed too
  await expect(admin.getByTestId("storage-indicator")).toContainText(`${baselinePhotos} fotos`);
  expect(await activePhotos(request)).toBe(baselinePhotos);
});

// --- Regression for the production 503 (2026-11-22): delete → new album → upload again ----------
const slug2 = `${slug}-b`;
let album2 = "";

test("8b. after deleting an album: stale reservations are released and a new album uploads fine", async ({ request }) => {
  // A reservation left by a failed upload 2 h ago (it must not block space forever).
  const { data: stale } = await supabase
    .from("photos")
    .insert({
      match_id: albumId, title: "stale.jpg", status: "uploading", is_published: false, original_key: `${albumId}/stale`,
      original_bytes: 5_000_000, preview_bytes: 1000, thumb_bytes: 500, created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  await admin.reload();
  await expect(admin.getByTestId("storage-indicator")).toContainText("1 carga(s) incompleta(s)");

  await admin.getByRole("button", { name: "+ Nuevo partido" }).click();
  await admin.getByLabel("Título del partido").fill(`E2E Fecha B ${runId}`);
  await admin.getByLabel("Slug").fill(slug2);
  await admin.getByRole("button", { name: "Crear galería" }).click();
  await expect(admin.getByText(/Galería .* creada/)).toBeVisible();

  // One transient 503 on an original upload: the client retries, without duplicating the photo.
  let failed = 0;
  await admin.route("**/api/admin/uploads/*/original", async (route) => {
    if (failed++ === 0) return route.fulfill({ status: 503, contentType: "text/html", body: "Error 1102: Worker exceeded resource limits" });
    return route.continue();
  });
  await admin.locator('input[type="file"]').setInputFiles(await makeJpegs(admin));
  await admin.getByRole("button", { name: "Subir fotos" }).click();
  await expect(admin.getByText("Se cargaron 3 imágenes correctamente.")).toBeVisible({ timeout: 120_000 });
  await admin.unroute("**/api/admin/uploads/*/original");
  expect(failed).toBeGreaterThan(3); // the 503 happened and every file still went through

  const { data: album } = await supabase.from("matches").select("id").eq("slug", slug2).single();
  album2 = album!.id;
  const { data: rows } = await supabase.from("photos").select("title, status").eq("match_id", album2);
  expect(rows!.map((r) => `${r.title}:${r.status}`).sort()).toEqual(files.map((f) => `${f}:active`).sort());

  const { data: staleRow } = await supabase.from("photos").select("status, original_bytes").eq("id", stale!.id).single();
  expect(staleRow).toEqual({ status: "deleted", original_bytes: 0 });
  await expect(admin.getByTestId("storage-indicator")).not.toContainText("carga(s) incompleta(s)");
  expect(await activePhotos(request)).toBe(baselinePhotos + 3);
});

test("8c. simultaneous uploads complete, without duplicates and within the budget", async ({ request }) => {
  const token = await tokenFor(env("E2E_ADMIN_EMAIL"), env("E2E_ADMIN_PASSWORD"));
  const auth = { Authorization: `Bearer ${token}` };
  const uploadOne = async (n: number) => {
    const sizes = { original: 2_000_000 + n, preview: 50_000 + n, thumb: 8_000 + n };
    const reserve = await request.post("/api/admin/uploads", {
      headers: auth,
      data: { albumId: album2, title: `parallel-${n}.jpg`, contentType: "image/jpeg", originalBytes: sizes.original, previewBytes: sizes.preview, thumbBytes: sizes.thumb },
    });
    const { photoId, uploads } = await reserve.json();
    for (const variant of ["original", "preview", "thumb"] as const) {
      expect(uploads[variant].direct).toBe(false); // local stack: no R2 S3 credentials → Worker route
      const put = await request.put(uploads[variant].url, {
        headers: { ...auth, "Content-Type": "image/jpeg" },
        data: Buffer.alloc(sizes[variant], n),
      });
      expect(put.status()).toBe(200);
    }
    return (await request.post(`/api/admin/uploads/${photoId}/complete`, { headers: auth, data: {} })).status();
  };
  expect(await Promise.all([1, 2, 3, 4].map(uploadOne))).toEqual([200, 200, 200, 200]);
  const { count } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("match_id", album2).eq("status", "active");
  expect(count).toBe(7);

  // Same reservation cannot receive a second (duplicate) file once published.
  const { data: one } = await supabase.from("photos").select("id").eq("match_id", album2).eq("title", "parallel-1.jpg").single();
  const again = await request.put(`/api/admin/uploads/${one!.id}/original`, { headers: { ...auth, "Content-Type": "image/jpeg" }, data: Buffer.alloc(10) });
  expect(again.status()).toBe(409);

  // An upload aborted after its preview was sent (no URLs stored yet) leaves no file behind.
  const aborted = await (
    await request.post("/api/admin/uploads", {
      headers: auth,
      data: { albumId: album2, title: "aborted.jpg", contentType: "image/jpeg", originalBytes: 1000, previewBytes: 500, thumbBytes: 200 },
    })
  ).json();
  for (const [variant, size] of [["original", 1000], ["preview", 500]] as const) {
    expect((await request.put(aborted.uploads[variant].url, { headers: { ...auth, "Content-Type": "image/jpeg" }, data: Buffer.alloc(size, 7) })).status()).toBe(200);
  }
  expect((await request.get(`/media/${album2}/${aborted.photoId}-preview.jpg`)).status()).toBe(200);
  expect((await request.post(`/api/admin/uploads/${aborted.photoId}/abort`, { headers: auth, data: {} })).status()).toBe(200);
  expect((await request.get(`/media/${album2}/${aborted.photoId}-preview.jpg?after=abort`)).status()).toBe(404);

  // Clean up: delete the album so later tests keep their baseline.
  const ids = (await supabase.from("photos").select("id").eq("match_id", album2)).data!.map((r) => r.id);
  const del = await request.post("/api/admin/deletions/execute", { headers: auth, data: { photoIds: ids, confirm: "ELIMINAR" } });
  expect((await del.json()).deleted).toBe(7);
  expect((await request.post(`/api/admin/albums/${album2}`, { headers: auth, data: { action: "finalize-delete" } })).status()).toBe(200);
  expect(await activePhotos(request)).toBe(baselinePhotos);
});

test("9. admin endpoints refuse anonymous and non-admin users; storage budget enforced", async ({ request }) => {
  expect((await request.get("/api/admin/storage")).status()).toBe(401);
  const userToken = await tokenFor(env("E2E_USER_EMAIL"), env("E2E_USER_PASSWORD"));
  for (const [method, path] of [
    ["GET", "/api/admin/storage"],
    ["POST", "/api/admin/deletions/execute"],
    ["POST", "/api/admin/uploads"],
  ] as const) {
    const response = await request.fetch(path, { method, headers: { Authorization: `Bearer ${userToken}` }, data: method === "POST" ? {} : undefined });
    expect(response.status(), `${method} ${path}`).toBe(403);
  }

  const { data: album } = await supabase
    .from("matches")
    .insert({ slug: `${slug}-limit`, title: "Límite", venue: "X", played_at: new Date().toISOString(), status: "draft" })
    .select("id")
    .single();
  const adminToken = await tokenFor(env("E2E_ADMIN_EMAIL"), env("E2E_ADMIN_PASSWORD"));
  const overBudget = await request.post("/api/admin/uploads", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { albumId: album!.id, title: "big.jpg", originalBytes: 39 * 1024 * 1024, previewBytes: 1000, thumbBytes: 100 },
  });
  expect(overBudget.status()).toBe(507);
  expect((await overBudget.json()).message).toContain("límite de almacenamiento");
});

test("10. drafts are hidden from the public but the admin can preview them", async ({ browser }) => {
  const { context, page } = await newAnonPage(browser);
  await page.goto(`/galeria/${slug}-limit`);
  await expect(page.getByText("No se encontró la galería solicitada.")).toBeVisible();
  await context.close();

  await admin.goto(`/galeria/${slug}-limit`);
  await expect(admin.getByText("Límite").first()).toBeVisible();
  await admin.goto("/admin");
});

test("11. responsive: no horizontal scroll on phones", async ({ browser }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    const phoneAdmin = await adminContext.newPage();
    await phoneAdmin.setViewportSize(viewport);
    await phoneAdmin.goto("/admin");
    await expect(phoneAdmin.getByRole("heading", { name: "Mis galerías" })).toBeVisible();
    const adminOverflow = await phoneAdmin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(adminOverflow, `admin @${viewport.width}`).toBeLessThanOrEqual(1);
    await phoneAdmin.close();

    const { context, page } = await newAnonPage(browser, viewport);
    for (const path of ["/", "/galerias", "/compras"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} @${viewport.width}`).toBeLessThanOrEqual(1);
    }
    await context.close();
  }
});
