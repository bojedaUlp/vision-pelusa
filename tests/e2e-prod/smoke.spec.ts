import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

const env = (name: string) => process.env[name] as string;
const MEDIA = "https://media.visionpelusa.com";
const files = ["smoke-1.jpg", "smoke-2.jpg"];
let adminContext: BrowserContext;
let admin: Page;
let albumId = "";
const photos: Array<{ id: string; original_key: string; thumbnail_url: string }> = [];

const service = () => createClient(env("SMOKE_SUPABASE_URL"), env("SMOKE_SERVICE_KEY"), { auth: { persistSession: false } });

async function makeJpegs(page: Page) {
  const encoded = await page.evaluate(async (count) => {
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 700;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = i ? "#1b4332" : "#283618";
      ctx.fillRect(0, 0, 1000, 700);
      ctx.fillStyle = "#ffc94a";
      ctx.font = "bold 80px sans-serif";
      ctx.fillText(`PRUEBA ${i + 1}`, 250, 380);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      out.push(btoa(binary));
    }
    return out;
  }, files.length);
  return encoded.map((b64, i) => ({ name: files[i], mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") }));
}

test.beforeAll(async ({ browser }) => {
  adminContext = await browser.newContext();
  admin = await adminContext.newPage();
});
test.afterAll(async () => adminContext?.close());

test("public site is up and serves the new release", async ({ request }) => {
  for (const path of ["/", "/galerias", "/compras"]) expect((await request.get(path)).status(), path).toBe(200);
  expect((await request.get("/api/admin/storage")).status()).toBe(401);
});

test("admin logs in; storage indicator shows the 8 GB budget", async () => {
  await admin.goto("/admin");
  await admin.getByPlaceholder("admin@tu-dominio.com").fill(env("SMOKE_ADMIN_EMAIL"));
  await admin.getByPlaceholder("Ingresá tu contraseña").fill(env("SMOKE_ADMIN_PASSWORD"));
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin.getByRole("heading", { name: "Mis galerías" })).toBeVisible();
  await expect(admin.getByTestId("storage-indicator")).toContainText("de 8,00 GB");
});

test("admin creates a DRAFT album and uploads photos to R2", async () => {
  await admin.getByLabel("Título del partido").fill(`Prueba técnica ${env("SMOKE_SLUG")}`);
  await admin.getByLabel("Slug").fill(env("SMOKE_SLUG"));
  await admin.getByLabel("Estado").selectOption("Borrador");
  await admin.getByRole("button", { name: "Crear galería" }).click();
  await expect(admin.getByText(/Galería .* creada/)).toBeVisible();
  await admin.locator('input[type="file"]').setInputFiles(await makeJpegs(admin));
  await admin.getByRole("button", { name: "Subir fotos" }).click();
  await expect(admin.getByText("Se cargaron 2 imágenes correctamente.")).toBeVisible({ timeout: 120_000 });

  const { data: album } = await service().from("matches").select("id, status").eq("slug", env("SMOKE_SLUG")).single();
  expect(album!.status).toBe("draft");
  albumId = album!.id;
  const { data: rows } = await service().from("photos").select("id, status, original_key, thumbnail_url").eq("match_id", albumId);
  expect(rows).toHaveLength(2);
  for (const row of rows!) {
    expect(row.status).toBe("active");
    expect(row.thumbnail_url.startsWith(`${MEDIA}/${albumId}/`)).toBe(true);
    photos.push(row);
  }
});

test("draft is not public; media is served by R2; originals are never public", async ({ browser, request }) => {
  const anon = await browser.newContext();
  const page = await anon.newPage();
  await page.goto(`/galeria/${env("SMOKE_SLUG")}`);
  await expect(page.getByText("No se encontró la galería solicitada.")).toBeVisible();
  await anon.close();

  const thumb = await request.get(photos[0].thumbnail_url);
  expect(thumb.status()).toBe(200);
  expect(thumb.headers()["content-type"]).toBe("image/jpeg");
  expect((await request.get(`${MEDIA}/${photos[0].original_key}`)).status()).toBe(404);
  const rest = await request.get(`${env("SMOKE_SUPABASE_URL")}/rest/v1/photos?select=original_key`, {
    headers: { apikey: env("SMOKE_ANON_KEY") },
  });
  expect(rest.ok()).toBe(false);
  expect((await request.get(`/api/download/${photos[0].id}?purchaseId=${crypto.randomUUID()}`)).status()).toBe(403);
});

test("admin publishes the album and the public sees it", async ({ browser }) => {
  await admin.getByLabel("Estado").selectOption("Publicada");
  await admin.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(admin.getByText(/Cambios guardados/)).toBeVisible();

  const anon = await browser.newContext();
  const page = await anon.newPage();
  await page.goto(`/galeria/${env("SMOKE_SLUG")}`);
  await expect(page.locator('img[alt="smoke-1.jpg"]')).toBeVisible();
  await expect(page.locator('img[alt="smoke-2.jpg"]')).toBeVisible();
  await anon.close();
});

test("admin deletes the album: rows marked deleted, R2 objects removed, storage back to zero", async ({ request }) => {
  await admin.reload();
  await admin.getByRole("row", { name: new RegExp(env("SMOKE_SLUG")) }).getByRole("button", { name: "Eliminar" }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toContainText("Elegibles para eliminar: 2");
  await dialog.getByRole("textbox").fill("ELIMINAR");
  await admin.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(dialog).toContainText("Eliminadas: 2.");
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

  const { data: album } = await service().from("matches").select("status").eq("id", albumId).single();
  expect(album!.status).toBe("deleted");
  // Bypass the CDN cache with a unique query: R2 must no longer have the objects.
  for (const photo of photos) {
    expect((await request.get(`${photo.thumbnail_url}?check=${Date.now()}`)).status()).toBe(404);
  }
  await expect(admin.getByTestId("storage-indicator")).toContainText("0 fotos");
  await expect(admin.getByTestId("storage-indicator")).toContainText("0 KB de 8,00 GB");
});
