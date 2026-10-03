// Browser-only (Canvas). Used by the admin panel to bake the watermark into the pixels of the
// public PREVIEW and THUMBNAIL before upload. Re-encoding to JPEG also drops EXIF/GPS metadata.

const WATERMARK_TEXT = "VISION PELUSA";
const WATERMARK_ANGLE = (-28 * Math.PI) / 180;
const FONT_FAMILY = '"Arial Black", "Helvetica Neue", Arial, sans-serif';

export const PREVIEW_MAX_SIZE = 1600;
export const THUMBNAIL_MAX_SIZE = 640;
const PREVIEW_QUALITY = 0.82;
const THUMBNAIL_QUALITY = 0.75;

function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const shortSide = Math.min(width, height);
  const diagonal = Math.hypot(width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(WATERMARK_ANGLE);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  // Diagonal tiled pattern over the whole rotated surface (rows alternate half a step), so any
  // crop of a useful size still contains several marks.
  const tileSize = Math.max(11, Math.round(shortSide * 0.042));
  ctx.font = `800 ${tileSize}px ${FONT_FAMILY}`;
  const tileWidth = ctx.measureText(WATERMARK_TEXT).width;
  const stepX = tileWidth + tileSize * 2.4;
  const stepY = tileSize * 3.4;
  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
  ctx.lineWidth = Math.max(1, tileSize * 0.06);

  const half = diagonal / 2 + stepX;
  let row = 0;
  for (let y = -half; y <= half; y += stepY, row += 1) {
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    for (let x = -half + offset; x <= half; x += stepX) {
      ctx.strokeText(WATERMARK_TEXT, x, y);
      ctx.fillText(WATERMARK_TEXT, x, y);
    }
  }

  // Central mark, more visible but still translucent so the player stays visible.
  let centerSize = Math.round(shortSide * 0.13);
  ctx.font = `800 ${centerSize}px ${FONT_FAMILY}`;
  const maxCenterWidth = diagonal * 0.62;
  const centerWidth = ctx.measureText(WATERMARK_TEXT).width;
  if (centerWidth > maxCenterWidth) {
    centerSize = Math.floor(centerSize * (maxCenterWidth / centerWidth));
    ctx.font = `800 ${centerSize}px ${FONT_FAMILY}`;
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.33)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.lineWidth = Math.max(1.5, centerSize * 0.04);
  ctx.strokeText(WATERMARK_TEXT, 0, 0);
  ctx.fillText(WATERMARK_TEXT, 0, 0);

  ctx.restore();
}

async function renderVariant(bitmap: ImageBitmap, maxSize: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible en este navegador.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  drawWatermark(ctx, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen protegida."))),
      "image/jpeg",
      quality,
    );
  });
}

/** PREVIEW (≤1600px) and THUMBNAIL (≤640px), both watermarked in the pixels. */
export async function createProtectedVariants(source: Blob): Promise<{ preview: Blob; thumbnail: Blob }> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const preview = await renderVariant(bitmap, PREVIEW_MAX_SIZE, PREVIEW_QUALITY);
    const thumbnail = await renderVariant(bitmap, THUMBNAIL_MAX_SIZE, THUMBNAIL_QUALITY);
    return { preview, thumbnail };
  } finally {
    bitmap.close();
  }
}
