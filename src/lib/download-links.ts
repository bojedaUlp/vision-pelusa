export const downloadHref = (purchaseId: string, photoId: string) =>
  `/api/download/${encodeURIComponent(photoId)}?purchaseId=${encodeURIComponent(purchaseId)}`;

// Must match DOWNLOAD_ACCESS_DAYS in purchases-server.ts.
export const DOWNLOAD_WINDOW_DAYS = 7;

const formatDeadline = (value: string) =>
  new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });

// Buyer-facing text about the download window (albums are removed after it).
export function downloadDeadlineText(expiresAt: string | null | undefined) {
  if (!expiresAt) return `Tenés ${DOWNLOAD_WINDOW_DAYS} días desde el pago para descargar tus fotos.`;
  return new Date(expiresAt).getTime() > Date.now()
    ? `Descargá tus fotos antes del ${formatDeadline(expiresAt)}. Después de esa fecha dejan de estar disponibles.`
    : `El plazo de descarga venció el ${formatDeadline(expiresAt)}.`;
}

export const downloadExpired = (expiresAt: string | null | undefined) =>
  Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= Date.now();
