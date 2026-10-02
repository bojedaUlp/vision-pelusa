export const downloadHref = (purchaseId: string, photoId: string) =>
  `/api/download/${encodeURIComponent(photoId)}?purchaseId=${encodeURIComponent(purchaseId)}`;
