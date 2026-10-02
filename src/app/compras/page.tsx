"use client";

import { useEffect, useState } from "react";
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

type PaymentState = "idle" | "validating" | "approved" | "pending" | "failed";

const paymentMessages: Record<Exclude<PaymentState, "idle">, string> = {
  validating: "Validando tu pago...",
  approved: "Pago confirmado",
  pending: "Tu pago está pendiente de acreditación. Cuando Mercado Pago lo apruebe vas a ver tus fotos acá.",
  failed: "No pudimos validar el pago.",
};

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
    : "";

export default function ComprasPage() {
  const [query, setQuery] = useState("");
  const [searchedEmail, setSearchedEmail] = useState("");
  const [purchaseData, setPurchaseData] = useState<PaidPurchase[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");

  const fetchPurchasesForEmail = async (email: string) => {
    const trimmed = email.trim();
    setSearchedEmail(trimmed);
    setLookupError(null);

    if (!trimmed) {
      setPurchaseData([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/purchases?email=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        setLookupError(payload?.message ?? "No pudimos consultar tus compras.");
        setPurchaseData([]);
        return;
      }

      setPurchaseData(Array.isArray(payload.purchases) ? payload.purchases : []);
    } catch (error) {
      console.error("purchase lookup failed", error);
      setLookupError("No pudimos consultar tus compras.");
      setPurchaseData([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const emailFromUrl = searchParams.get("email") ?? "";
    // Only payment_id is used; status=approved in the URL is never trusted.
    const paymentId = searchParams.get("payment_id") ?? searchParams.get("collection_id") ?? "";

    if (emailFromUrl) setQuery(emailFromUrl);

    const run = async () => {
      if (paymentId && paymentId !== "null") {
        setPaymentState("validating");
        try {
          const response = await fetch("/api/payments/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId }),
          });
          const payload = await response.json();
          setPaymentState(
            payload?.state === "approved" ? "approved" : payload?.state === "pending" ? "pending" : "failed",
          );
        } catch (error) {
          console.error("payment confirmation failed", error);
          setPaymentState("failed");
        }
      }

      if (emailFromUrl) {
        await fetchPurchasesForEmail(emailFromUrl);
      }
    };

    void run();
  }, []);

  const handleSearch = async () => {
    await fetchPurchasesForEmail(query);
  };

  const hasResults = purchaseData.length > 0;
  const showEmptyState = Boolean(searchedEmail) && !isSearching && !hasResults && !lookupError && paymentState !== "validating";

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <header className="border-b border-white/10 bg-[#0B0F14]/90 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
            <span className="text-[14px] font-semibold tracking-[0.08em] text-[#F4F1E8]">Visión Pelusa</span>
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
            Ingresá el email que usaste al pagar para volver a descargar tus fotos en alta calidad.
          </p>

          <div className="mx-auto mt-8 flex max-w-[440px] gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSearch();
              }}
              type="email"
              className="field-input flex-1"
              placeholder="tu@email.com"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={isSearching}
              className="bg-[#FFC94A] px-5 py-3 font-semibold uppercase tracking-[0.04em] text-[#0B0F14] disabled:opacity-60"
            >
              Buscar
            </button>
          </div>
        </div>

        {paymentState !== "idle" ? (
          <div
            className={`mx-auto mt-4 max-w-[520px] rounded-[4px] border px-4 py-3 text-center text-[12px] ${
              paymentState === "approved"
                ? "border-[#6FCF97]/20 bg-[#6FCF97]/10 text-[#6FCF97]"
                : paymentState === "failed"
                  ? "border-[#EB5757]/30 bg-[#EB5757]/10 text-[#F2994A]"
                  : "border-[#FFC94A]/20 bg-[#FFC94A]/10 text-[#F6D36F]"
            }`}
          >
            {paymentMessages[paymentState]}
          </div>
        ) : null}

        {lookupError ? (
          <div className="mx-auto mt-4 max-w-[520px] rounded-[4px] border border-[#FFC94A]/20 bg-[#FFC94A]/10 px-4 py-3 text-center text-[12px] text-[#F6D36F]">
            {lookupError}
          </div>
        ) : null}

        {hasResults ? (
          <div className="mt-10 space-y-5">
            {purchaseData.map((purchase) => {
              const detailHref = `/compras/${purchase.id}`;
              const photoCount = purchase.photos.length;
              const singlePhoto = photoCount === 1 ? purchase.photos[0] : null;

              return (
                <div key={purchase.id} className="rounded-[5px] border border-white/10 bg-[#111820] p-6">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[#F4F1E8]">
                        Compra Pelusa · {formatDate(purchase.paidAt ?? purchase.createdAt)}
                      </h3>
                      <div className="mt-2 text-[12.5px] text-[#8A9A93]">
                        Pago confirmado · {photoCount} {photoCount === 1 ? "foto descargable" : "fotos descargables"}
                      </div>
                    </div>
                    <span className="rounded-full border border-[#6FCF97]/35 bg-[#6FCF97]/10 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[#6FCF97]">
                      ✓ Pagado
                    </span>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2.5">
                    {purchase.photos.slice(0, 4).map((photo) => (
                      <div key={photo.id} className="h-16 w-16 overflow-hidden rounded-[3px] bg-[#161f28]">
                        {photo.previewUrl ? (
                          <img src={photo.previewUrl} alt={photo.title} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    ))}
                    {photoCount > 4 ? (
                      <div className="flex h-16 w-16 items-center justify-center rounded-[3px] bg-[#161f28] font-mono text-[11px] text-[#8A9A93]">
                        +{photoCount - 4}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <div className="font-mono text-[13.5px] text-[#8A9A93]">
                      Total pagado <b className="text-[#F4F1E8]">${purchase.total.toLocaleString("es-AR")}</b>
                    </div>
                    <div className="flex gap-2.5">
                      <a href={detailHref} className="border border-white/10 bg-transparent px-3 py-2 text-[12.5px] text-[#F4F1E8]">
                        Ver fotos
                      </a>
                      <a
                        href={singlePhoto ? downloadHref(purchase.id, singlePhoto.id) : detailHref}
                        className="bg-[#FFC94A] px-4 py-2 text-[12.5px] font-semibold uppercase tracking-[0.02em] text-[#0B0F14]"
                      >
                        {singlePhoto ? "Descargar original" : "Descargar originales"}
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {showEmptyState ? (
          <div className="mt-10 rounded-[5px] border border-dashed border-white/15 bg-[#111820] p-12 text-center text-[#8A9A93]">
            <div className="mb-4 text-[34px]">🔍</div>
            <h3 className="text-[17px] font-semibold text-[#F4F1E8]">No encontramos compras con ese email</h3>
            <p className="mx-auto mt-2 max-w-[340px] text-[13.5px]">
              Revisá que sea el mismo que usaste al pagar, o <a href="/" className="text-[#FFC94A] underline">escribinos</a> si creés que es un error.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
