import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Production check of the 503 fix: a real 25–30 MB photo goes browser → R2 (presigned), never
// through the Worker; delete; new album; upload again. Temporary admin + throwaway albums.
test.describe.configure({ mode: "serial" });

const env = (name: string) => process.env[name] as string;
const MEDIA = "https://media.visionpelusa.com";
const service = () => createClient(env("SMOKE_SUPABASE_URL"), env("SMOKE_SERVICE_KEY"), { auth: { persistSession: false } });
let ctx: BrowserContext;
let admin: Page;
const serverErrors: string[] = [];
const r2Puts: Array<{ status: number; bytes: number }> = [];
const workerFilePuts: string[] = [];
let bigSize = 0;
let usageStart = 0;

async function usage(page: Page) {
  return page.evaluate(async () => {
    const raw = Object.entries(localStorage).find(([k]) => k.startsWith("sb-") && k.endsWith("-auth-token"))?.[1];
    const token = raw ? JSON.parse(raw).access_token : "";
    const r = await fetch("/api/admin/storage", { headers: { Authorization: `Bearer ${token}` } });
    return (await r.json()) as { usedBytes: number; photos: number; incompleteUploads: number };
  });
}

// A real, decodable JPEG of 25–30 MB generated in the browser (noise → poor compression).
async function bigJpeg(page: Page, name: string) {
  const b64 = await page.evaluate(async () => {
    let width = 4600;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const height = Math.round(width * 0.66);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx2 = canvas.getContext("2d")!;
      const img = ctx2.createImageData(width, height);
      const seed = new Uint32Array(1);
      for (let i = 0; i < img.data.length; i += 4) {
        crypto.getRandomValues(seed);
        img.data[i] = seed[0] & 255;
        img.data[i + 1] = (seed[0] >> 8) & 255;
        img.data[i + 2] = (seed[0] >> 16) & 255;
        img.data[i + 3] = 255;
      }
      ctx2.putImageData(img, 0, 0);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
      if (blob.size >= 25_000_000 && blob.size <= 30_000_000) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      }
      width = Math.round(width * Math.sqrt(27_500_000 / blob.size));
    }
    throw new Error("could not generate a 25–30 MB JPEG");
  });
  const buffer = Buffer.from(b64, "base64");
  return { name, mimeType: "image/jpeg", buffer };
}

async function smallJpeg(page: Page, name: string) {
  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1067;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#1b4332";
    c.fillRect(0, 0, 1600, 1067);
    c.fillStyle = "#ffc94a";
    c.font = "bold 120px sans-serif";
    c.fillText("PRUEBA", 500, 560);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return { name, mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") };
}

async function createDraftAlbum(slug: string, title: string) {
  await admin.getByRole("button", { name: "+ Nuevo partido" }).click();
  await admin.getByLabel("Título del partido").fill(title);
  await admin.getByLabel("Slug").fill(slug);
  await admin.getByLabel("Estado").selectOption("Borrador");
  await admin.getByRole("button", { name: "Crear galería" }).click();
  await expect(admin.getByText(/Galería .* creada/)).toBeVisible();
}

async function deleteAlbum(slug: string, photos: number) {
  await admin.reload();
  await admin.getByRole("row", { name: new RegExp(slug) }).getByRole("button", { name: "Eliminar" }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toContainText(`Elegibles para eliminar: ${photos}`);
  await dialog.getByRole("textbox").fill("ELIMINAR");
  await admin.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(dialog).toContainText(`Eliminadas: ${photos}.`);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
}

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  admin = await ctx.newPage();
  admin.on("response", (response: Response) => {
    const url = response.url();
    const method = response.request().method();
    if (response.status() >= 500) serverErrors.push(`${method} ${new URL(url).pathname} → ${response.status()}`);
    if (method === "PUT" && url.includes(".r2.cloudflarestorage.com/")) {
      r2Puts.push({ status: response.status(), bytes: Number(response.request().headers()["content-length"] ?? 0) });
    }
    if (method === "PUT" && /\/api\/admin\/uploads\/[^/]+\/(original|preview|thumb)$/.test(new URL(url).pathname)) workerFilePuts.push(url);
  });
});
test.afterAll(async () => ctx?.close());

test("admin logs in", async () => {
  await admin.goto("/admin");
  await admin.getByPlaceholder("admin@tu-dominio.com").fill(env("SMOKE_ADMIN_EMAIL"));
  await admin.getByPlaceholder("Ingresá tu contraseña").fill(env("SMOKE_ADMIN_PASSWORD"));
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin.getByRole("heading", { name: "Mis galerías" })).toBeVisible();

  // Release reservations left by the old version (authorized): reported in the output.
  const before = await usage(admin);
  const released = await admin.evaluate(async () => {
    const raw = Object.entries(localStorage).find(([k]) => k.startsWith("sb-") && k.endsWith("-auth-token"))?.[1];
    const token = raw ? JSON.parse(raw).access_token : "";
    const r = await fetch("/api/admin/uploads/cleanup", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  });
  const after = await usage(admin);
  console.log(
    `[limpieza previa] HTTP ${released.status} · liberadas ${released.body.cleaned} · ${((before.usedBytes - after.usedBytes) / 1e6).toFixed(1)} MB · pendientes ahora ${after.incompleteUploads}`,
  );
  expect(released.status).toBe(200);
  usageStart = after.usedBytes;
});

let firstAlbum = "";
let bigPhoto: { id: string; original_key: string; thumbnail_url: string; watermark_url: string; original_bytes: number } | null = null;

test("a real 25–30 MB photo is uploaded browser → R2 (presigned), never through the Worker", async () => {
  await createDraftAlbum(env("SMOKE_SLUG"), `Prueba 30MB ${env("SMOKE_SLUG")}`);
  const file = await bigJpeg(admin, "grande-30mb.jpg");
  bigSize = file.buffer.length;
  expect(bigSize).toBeGreaterThanOrEqual(25_000_000);
  expect(bigSize).toBeLessThanOrEqual(30_000_000);

  await admin.locator('input[type="file"]').setInputFiles(file);
  await admin.getByRole("button", { name: "Subir fotos" }).click();
  await expect(admin.getByText("Se cargaron 1 imagen correctamente.")).toBeVisible({ timeout: 240_000 });

  expect(workerFilePuts, "no file may pass through the Worker").toEqual([]);
  expect(r2Puts.filter((p) => p.status === 200).length).toBe(3); // original + preview + thumbnail, straight to R2

  const { data: album } = await service().from("matches").select("id").eq("slug", env("SMOKE_SLUG")).single();
  firstAlbum = album!.id;
  const { data: rows } = await service()
    .from("photos")
    .select("id, status, original_key, thumbnail_url, watermark_url, original_bytes")
    .eq("match_id", firstAlbum);
  expect(rows).toHaveLength(1);
  expect(rows![0]).toMatchObject({ status: "active", original_bytes: bigSize });
  bigPhoto = rows![0];
});

test("the original stays private; watermarked preview and thumbnail are public", async ({ request }) => {
  const thumb = await request.get(bigPhoto!.thumbnail_url);
  const preview = await request.get(bigPhoto!.watermark_url);
  expect([thumb.status(), preview.status()]).toEqual([200, 200]);
  expect(thumb.headers()["content-type"]).toBe("image/jpeg");
  expect((await preview.body()).length).toBeLessThan(bigSize / 10);
  expect((await request.get(`${MEDIA}/${bigPhoto!.original_key}`)).status()).toBe(404);
  const acc = "61bfc7101bfefd89b88511f640675782";
  expect((await request.get(`https://${acc}.r2.cloudflarestorage.com/vision-pelusa-originals/${bigPhoto!.original_key}`)).status()).toBe(400);
  const rest = await request.get(`${env("SMOKE_SUPABASE_URL")}/rest/v1/photos?select=original_key`, { headers: { apikey: env("SMOKE_ANON_KEY") } });
  expect(rest.ok()).toBe(false);

  // The admin panel shows the watermarked thumbnail.
  await admin.reload();
  await admin.getByRole("row", { name: new RegExp(env("SMOKE_SLUG")) }).getByRole("button", { name: "Fotos" }).click();
  await expect(admin.getByTestId("admin-photo").locator("img")).toHaveAttribute("src", bigPhoto!.thumbnail_url);
  const loaded = await admin.getByTestId("admin-photo").locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(loaded).toBe(true);

  const used = (await usage(admin)).usedBytes;
  expect(used - usageStart).toBeGreaterThanOrEqual(bigSize);
});

test("delete the album: files gone from R2 and space released", async ({ request }) => {
  await deleteAlbum(env("SMOKE_SLUG"), 1);
  for (const url of [bigPhoto!.thumbnail_url, bigPhoto!.watermark_url]) expect((await request.get(`${url}?check=${Date.now()}`)).status()).toBe(404);
  expect((await usage(admin)).usedBytes).toBe(usageStart);
});

test("a new album right after: upload several photos again (one 25–30 MB), no 5xx", async () => {
  const slug2 = `${env("SMOKE_SLUG")}-b`;
  r2Puts.length = 0;
  await createDraftAlbum(slug2, `Prueba recarga ${slug2}`);
  const files = [await bigJpeg(admin, "otra-grande.jpg"), await smallJpeg(admin, "chica-1.jpg"), await smallJpeg(admin, "chica-2.jpg")];
  await admin.locator('input[type="file"]').setInputFiles(files);
  await admin.getByRole("button", { name: "Subir fotos" }).click();
  await expect(admin.getByText("Se cargaron 3 imágenes correctamente.")).toBeVisible({ timeout: 300_000 });
  expect(workerFilePuts).toEqual([]);
  expect(r2Puts.filter((p) => p.status === 200).length).toBe(9);

  const { data: album } = await service().from("matches").select("id").eq("slug", slug2).single();
  const { data: rows } = await service().from("photos").select("status").eq("match_id", album!.id);
  expect(rows!.map((r) => r.status)).toEqual(["active", "active", "active"]);
  const after = await usage(admin);
  expect(after.incompleteUploads).toBe(0);

  await deleteAlbum(slug2, 3);
  expect((await usage(admin)).usedBytes).toBe(usageStart);
  expect(serverErrors, "no 5xx during the whole flow").toEqual([]);
});
