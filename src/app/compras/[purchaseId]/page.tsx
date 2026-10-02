"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { downloadHref } from "@/lib/download-links";

type PurchasedPhoto = {
  id: string;
  number: number;
  title: string;
  previewUrl: string | null;
  unitPrice: number;
};

type PaidPurchase = {
  id: string;
  total: number;
  createdAt: string;
  paidAt: string | null;
  photos: PurchasedPhoto[];
};

export default function PurchaseDetailPage() {
  const params = useParams<{ purchaseId: string }>();
  const purchaseId = typeof params?.purchaseId === "string" ? params.purchaseId : "";
  const [purchase, setPurchase] = useState<PaidPurchase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!purchaseId) return;

    fetch(`/api/purchases/${encodeURIComponent(purchaseId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message ?? "No encontramos esa compra.");
        }
        setPurchase(payload.purchase as PaidPurchase);
      })
      .catch((error: unknown) => {
        console.error("purchase detail failed", error);
        setPurchase(null);
        setErrorMessage(error instanceof Error ? error.message : "No pudimos consultar la compra.");
      })
      .finally(() => setIsLoading(false));
  }, [purchaseId]);

  const paidDate = purchase
    ? new Date(purchase.paidAt ?? purchase.createdAt).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <header className="border-b border-white/10 bg-[#0B0F14]/90 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-3">
            <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
            <span className="text-[14px] font-semibold tracking-[0.08em] text-[#F4F1E8]">Visión Pelusa</span>
          </Link>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="text-[13px] text-[#8A9A93] transition-colors hover:text-[#F4F1E8]"
          >
            ← Volver a Mis fotos
          </button>
        </div>
      </header>

      <div className="section-shell max-w-[1100px] py-12">
        <div className="mono mb-4 text-[11px] uppercase tracking-[0.18em] text-[#FFC94A]">Tu compra</div>

        {isLoading ? (
          <h1 className="text-[22px] text-[#F4F1E8]">Cargando tus fotos...</h1>
        ) : errorMessage || !purchase ? (
          <div className="rounded-[5px] border border-dashed border-white/15 bg-[#111820] p-12 text-center text-[#8A9A93]">
            <h1 className="text-[17px] font-semibold text-[#F4F1E8]">{errorMessage ?? "No encontramos esa compra."}</h1>
            <p className="mx-auto mt-2 max-w-[360px] text-[13.5px]">
              Volvé a <Link href="/compras" className="text-[#FFC94A] underline">Mis fotos</Link> y buscá con el email que usaste al pagar.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-[clamp(24px,3.5vw,32px)] font-semibold text-[#F4F1E8]">Compra Pelusa · {paidDate}</h1>
                <div className="mt-2 text-[13px] text-[#8A9A93]">
                  {purchase.photos.length} {purchase.photos.length === 1 ? "foto" : "fotos"} · Total pagado{" "}
                  <b className="text-[#F4F1E8]">${purchase.total.toLocaleString("es-AR")}</b>
                </div>
              </div>
              <span className="rounded-full border border-[#6FCF97]/35 bg-[#6FCF97]/10 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[#6FCF97]">
                ✓ Pagado
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {purchase.photos.map((photo) => (
                <div key={photo.id} className="overflow-hidden rounded-[4px] border border-white/10 bg-[#111820]">
                  <div className="relative aspect-[3/4] bg-[#161f28]">
                    {photo.previewUrl ? (
                      <img src={photo.previewUrl} alt={photo.title} className="absolute inset-0 h-full w-full object-cover" />
                    ) : null}
                    <div className="absolute left-2 top-2 rounded-sm bg-[#0B0F14]/60 px-2 py-1 font-mono text-[10px] text-[#8A9A93]">
                      {photo.number}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0 truncate text-[13px] text-[#F4F1E8]" title={photo.title}>
                      {photo.title}
                    </div>
                    <a
                      href={downloadHref(purchase.id, photo.id)}
                      className="shrink-0 bg-[#FFC94A] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.02em] text-[#0B0F14]"
                    >
                      Descargar original
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
