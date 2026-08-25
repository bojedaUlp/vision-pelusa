"use client";

import { useEffect, useState } from "react";
import { getPurchases } from "@/lib/data-source";

export default function ComprasPage() {
  const [query, setQuery] = useState("");
  const [hasResults, setHasResults] = useState(true);
  const [purchaseData, setPurchaseData] = useState<Array<{ title: string; meta: string; badge: string; total: number; count: number; photoId: number }>>([]);
  const [downloadLabel, setDownloadLabel] = useState<string | null>(null);

  const fetchPurchasesForEmail = async (email: string) => {
    const trimmed = email.trim();
    const hasEmail = trimmed.includes("@") || trimmed.length > 5;
    setHasResults(hasEmail);

    if (!trimmed) {
      const fallback = await getPurchases();
      setPurchaseData(fallback.map((purchase, index) => ({
        ...purchase,
        photoId: index + 1,
      })));
      return;
    }

    try {
      const response = await fetch(`/api/purchases?email=${encodeURIComponent(trimmed)}`);
      const payload = await response.json();

      if (payload?.purchases) {
        setPurchaseData(payload.purchases.map((purchase: any, index: number) => ({
          title: purchase.title,
          meta: purchase.meta,
          badge: purchase.badge,
          total: Number(purchase.total ?? 0),
          count: Number(purchase.count ?? 0),
          photoId: index + 1,
        })));
      }
    } catch (error) {
      console.error("purchase lookup failed", error);
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const emailFromUrl = searchParams.get("email") ?? "";

    if (emailFromUrl) {
      setQuery(emailFromUrl);
      void fetchPurchasesForEmail(emailFromUrl);
      return;
    }

    void getPurchases().then((data) =>
      setPurchaseData(data.map((purchase, index) => ({
        ...purchase,
        photoId: index + 1,
      }))),
    );
  }, []);

  const handleSearch = async () => {
    const trimmed = query.trim();
    await fetchPurchasesForEmail(trimmed);
  };

  const handleDownload = async (title: string, photoId: number) => {
    setDownloadLabel(`Preparando ${title}...`);

    try {
      const email = query.trim();
      if (!email) {
        setDownloadLabel("Ingresá tu email para validar tu compra.");
        return;
      }

      const response = await fetch(`/api/download?email=${encodeURIComponent(email)}&photoId=${encodeURIComponent(photoId)}`);
      const payload = await response.json();

      if (!response.ok || !payload?.originalUrl) {
        setDownloadLabel(payload?.message ?? "Todavía no tenés acceso a esta descarga.");
        return;
      }

      const link = document.createElement("a");
      link.href = payload.originalUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = `${title.toLowerCase().replace(/\s+/g, "-")}-original.jpg`;
      link.click();

      setDownloadLabel("Descarga autorizada. La imagen original está lista.");
    } catch (error) {
      console.error("download request failed", error);
      setDownloadLabel("No se pudo autorizar la descarga.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <header className="border-b border-white/10 bg-[#0B0F14]/90 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
          </div>

          <a href="/" className="text-[13px] text-[#8A9A93] transition-colors hover:text-[#F4F1E8]">
            ← Volver al sitio
          </a>
        </div>
      </header>

      <div className="section-shell max-w-[920px] py-12">
        <div className="text-center">
          <div className="mono mb-4 text-[11px] uppercase tracking-[0.18em] text-[#FFC94A]">Acceso a compras</div>
          <h1 className="text-[clamp(26px,4vw,36px)] font-semibold text-[#F4F1E8]">Mis fotos</h1>
          <p className="mx-auto mt-3 max-w-[560px] text-[14.5px] text-[#8A9A93]">
            Ingresá el email o WhatsApp que usaste al pagar para volver a descargar tus fotos en alta calidad.
          </p>

          <div className="mx-auto mt-8 flex max-w-[440px] gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="text"
              className="field-input flex-1"
              placeholder="tu@email.com"
            />
            <button
              type="button"
              onClick={handleSearch}
              className="bg-[#FFC94A] px-5 py-3 font-semibold uppercase tracking-[0.04em] text-[#0B0F14]"
            >
              Buscar
            </button>
          </div>
        </div>

        {downloadLabel ? (
          <div className="mx-auto mt-4 max-w-[520px] rounded-[4px] border border-[#FFC94A]/20 bg-[#FFC94A]/10 px-4 py-3 text-center text-[12px] text-[#F6D36F]">
            {downloadLabel}
          </div>
        ) : null}

        {hasResults ? (
          <div className="mt-10 space-y-5">
            {purchaseData.map((purchase, index) => (
              <div key={`${purchase.title}-${purchase.total}-${index}`} className="rounded-[5px] border border-white/10 bg-[#111820] p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#F4F1E8]">{purchase.title}</h3>
                    <div className="mt-2 text-[12.5px] text-[#8A9A93]">{purchase.meta}</div>
                  </div>
                  <span className="rounded-full border border-[#6FCF97]/35 bg-[#6FCF97]/10 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[#6FCF97]">
                    ✓ {purchase.badge}
                  </span>
                </div>

                <div className="mb-4 flex flex-wrap gap-2.5">
                  {Array.from({ length: Math.min(4, purchase.count) }).map((_, idx) => (
                    <div
                      key={`${purchase.title}-${idx}`}
                      className="h-16 w-16 rounded-[3px]"
                      style={{
                        background:
                          idx % 4 === 0
                            ? "linear-gradient(150deg,#1B4332,#0B0F14 75%)"
                            : idx % 4 === 1
                              ? "linear-gradient(150deg,#28603f,#111820 75%)"
                              : idx % 4 === 2
                                ? "linear-gradient(150deg,#173c2c,#0B0F14 75%)"
                                : "linear-gradient(150deg,#204a37,#0B0F14 75%)",
                      }}
                    />
                  ))}
                  {purchase.count > 4 ? (
                    <div className="flex h-16 w-16 items-center justify-center rounded-[3px] bg-[#161f28] font-mono text-[11px] text-[#8A9A93]">
                      +{purchase.count - 4}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <div className="font-mono text-[13.5px] text-[#8A9A93]">
                    Total pagado <b className="text-[#F4F1E8]">${purchase.total.toLocaleString("es-AR")}</b>
                  </div>
                  <div className="flex gap-2.5">
                    <button type="button" className="border border-white/10 bg-transparent px-3 py-2 text-[12.5px] text-[#F4F1E8]">
                      Ver fotos
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownload(purchase.title, purchase.photoId)}
                      className="bg-[#FFC94A] px-4 py-2 text-[12.5px] font-semibold uppercase tracking-[0.02em] text-[#0B0F14]"
                    >
                      Descargar original
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-[5px] border border-dashed border-white/15 bg-[#111820] p-12 text-center text-[#8A9A93]">
            <div className="mb-4 text-[34px]">🔍</div>
            <h3 className="text-[17px] font-semibold text-[#F4F1E8]">No encontramos compras con ese email</h3>
            <p className="mx-auto mt-2 max-w-[340px] text-[13.5px]">
              Revisá que sea el mismo que usaste al pagar, o <a href="/" className="text-[#FFC94A] underline">escribinos</a> si creés que es un error.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
