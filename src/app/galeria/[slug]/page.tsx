"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getMatchBySlug, getPhotosByMatchSlug } from "@/lib/data-source";
import { getPriceForCount } from "@/lib/mock-data";

export default function GalleryPage() {
  const params = useParams<{ slug: string }>();
  const resolvedSlug = typeof params?.slug === "string" ? params.slug : null;
  type GalleryPhoto = {
    id: number;
    number: number;
    title: string;
    price: number;
    imageUrl?: string;
    watermarkUrl?: string;
  };

  const [selected, setSelected] = useState<number[]>([]);
  const [buyerEmail, setBuyerEmail] = useState("juan.perez@gmail.com");
  const [photoData, setPhotoData] = useState<GalleryPhoto[]>([]);
  const [match, setMatch] = useState<{ slug: string; tag?: string; title: string; subtitle: string; venue: string; date: string; photoCount: number } | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);

  const visiblePhotoCount = Math.max(photoData.length, match?.photoCount ?? 0);

  const normalizedPhotoData = useMemo(() => {
    const unique = new Map<string, GalleryPhoto>();

    photoData.forEach((photo, index) => {
      const rawId = Number(photo.id ?? photo.number ?? index + 1);
      const rawNumber = Number(photo.number ?? photo.id ?? index + 1);
      const id = Number.isFinite(rawId) ? rawId : index + 1;
      const number = Number.isFinite(rawNumber) ? rawNumber : index + 1;
      const price = Number.isFinite(Number(photo.price)) ? Number(photo.price) : 1500;
      const imageUrl = typeof photo.imageUrl === "string" ? photo.imageUrl : "";
      const watermarkUrl = typeof photo.watermarkUrl === "string" ? photo.watermarkUrl : imageUrl;
      const key = `${id}-${number}`;

      if (!unique.has(key)) {
        unique.set(key, {
          ...photo,
          id,
          number,
          price,
          imageUrl,
          watermarkUrl,
        });
      }
    });

    return Array.from(unique.values());
  }, [photoData]);

  useEffect(() => {
    if (!resolvedSlug) return;

    void getMatchBySlug(resolvedSlug).then((data) => {
      setMatch(data ?? null);
    });

    void getPhotosByMatchSlug(resolvedSlug).then((data) => {
      setPhotoData(data);
    });
  }, [resolvedSlug]);

  const selectedCount = selected.length;
  const selectedTotal = useMemo(() => {
    const total = getPriceForCount(selectedCount);
    return Number.isFinite(total) ? total : 0;
  }, [selectedCount]);

  const safeSelectedTotal = Number.isFinite(selectedTotal) ? selectedTotal : 0;
  const safeSelectedCount = Number.isFinite(selectedCount) ? selectedCount : 0;

  const togglePhoto = (id: number) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const selectAll = () => {
    setSelected(normalizedPhotoData.map((photo) => photo.id));
  };

  const clearSelection = () => {
    setSelected([]);
  };

  const isAllSelected = safeSelectedCount === normalizedPhotoData.length;

  const handleCheckout = async () => {
    if (selectedCount === 0) return;

    const trimmedEmail = buyerEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setCheckoutMessage("Ingresá un email válido para confirmar la compra.");
      return;
    }

    setIsPaying(true);
    setCheckoutMessage(null);

    try {
      const selectedPhotos = normalizedPhotoData.filter((photo) => selected.includes(photo.id));
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: trimmedEmail,
          items: selectedPhotos.map((photo) => ({
            id: photo.id,
            title: `${match?.title ?? "Foto"} · ${photo.number}`,
            price: photo.price,
            quantity: 1,
          })),
        }),
      });

      const payload = await response.json();

      if (
        payload?.checkoutUrl &&
        typeof payload.checkoutUrl === "string" &&
        /^https?:\/\//i.test(payload.checkoutUrl) &&
        !payload.checkoutUrl.includes("pref_id=mock_")
      ) {
        const redirectUrl = payload.checkoutUrl;

        if (payload?.mock && payload?.paymentId) {
          await fetch("/api/payments/webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: trimmedEmail,
              buyer_email: trimmedEmail,
              title: `${match?.title ?? "Compra Pelusa"} · ${selectedPhotos.length} fotos`,
              total: payload.total,
              count: selectedPhotos.length,
            }),
          });
        }

        window.location.href = redirectUrl;
        return;
      }

      setCheckoutMessage(payload?.message ?? "No se pudo abrir el checkout. Verificá la configuración de Mercado Pago.");
    } catch (error) {
      console.error("checkout request failed", error);
      setCheckoutMessage("Hubo un problema al iniciar el pago.");
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <header className="border-b border-white/10 bg-[#0B0F14]/90 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
            <span className="text-[14px] font-semibold tracking-[0.08em] text-[#F4F1E8]">Visión Pelusa</span>
          </a>

          <a href="/" className="text-[13.5px] text-[#8A9A93] transition-colors hover:text-[#F4F1E8]">
            ← Volver a galerías
          </a>
        </div>
      </header>

      <div className="section-shell">
        <div className="border-b border-white/10 py-10">
          <div className="mono mb-4 text-[11px] uppercase tracking-[0.08em] text-[#8A9A93]">
            <a href="/" className="hover:text-[#FFC94A]">Inicio</a> / <a href="/" className="hover:text-[#FFC94A]">Galerías</a> / {match?.tag ?? resolvedSlug ?? "Partido"}
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-[clamp(26px,4vw,38px)] font-semibold text-[#F4F1E8]">
                {match?.title ?? "Cargando galería..."}
              </h1>
              <div className="mt-4 flex flex-wrap gap-5 text-[13.5px] text-[#8A9A93]">
                <span>📅 <b className="font-medium text-[#FFC94A]">{match?.date ?? "Fecha"}</b></span>
                <span>📍 <b className="font-medium text-[#FFC94A]">{match?.venue ?? "Cancha"}</b></span>
                <span>🖼️ <b className="font-medium text-[#FFC94A]">{visiblePhotoCount} fotos</b></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-shell grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[13.5px] text-[#8A9A93]">
              <b id="selectedCount" className="text-[#F4F1E8]">{safeSelectedCount}</b> de {normalizedPhotoData.length} fotos seleccionadas
            </div>
            <button
              type="button"
              onClick={isAllSelected ? clearSelection : selectAll}
              className="border border-white/10 bg-transparent px-4 py-2 font-mono text-[11.5px] uppercase tracking-[0.08em] text-[#FFC94A] transition-colors hover:border-[#FFC94A]"
            >
              {isAllSelected ? "Deseleccionar todo" : "Seleccionar todas"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {normalizedPhotoData.map((photo, index) => {
              const isSelected = selected.includes(photo.id);
              const photoPrice = Number.isFinite(Number(photo.price)) ? Number(photo.price) : 1500;
              const displayPrice = photoPrice >= 1500 ? "$1.500" : "$900";
              const photoKey = `photo-${photo.id ?? index + 1}-${photo.number ?? index + 1}-${index}`;
              const paletteIndex = ((Number(photo.id) || Number(photo.number) || index + 1) % 6) + 1;
              const mediaUrl = isSelected ? (photo.imageUrl || "/logo-vision-pelusa.svg") : (photo.watermarkUrl || photo.imageUrl || "/logo-vision-pelusa.svg");

              return (
                <button
                  key={photoKey}
                  type="button"
                  onClick={() => togglePhoto(photo.id)}
                  className={`group relative aspect-[3/4] overflow-hidden rounded-[3px] border-2 transition-all ${
                    isSelected ? "border-[#FFC94A]" : "border-transparent"
                  }`}
                >
                  <img
                    src={mediaUrl}
                    alt={photo.title || `Foto ${photo.number}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />

                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        paletteIndex === 1
                          ? "linear-gradient(150deg,rgba(27,67,50,0.15),rgba(11,15,20,0.75))"
                          : paletteIndex === 2
                            ? "linear-gradient(150deg,rgba(40,96,63,0.15),rgba(17,24,32,0.8))"
                            : paletteIndex === 3
                              ? "linear-gradient(150deg,rgba(23,60,44,0.15),rgba(11,15,20,0.75))"
                              : paletteIndex === 4
                                ? "linear-gradient(150deg,rgba(32,74,55,0.15),rgba(11,15,20,0.75))"
                                : paletteIndex === 5
                                  ? "linear-gradient(150deg,rgba(27,67,50,0.15),rgba(17,24,32,0.8))"
                                  : "linear-gradient(150deg,rgba(43,92,70,0.15),rgba(11,15,20,0.75))",
                    }}
                  />

                  <div className="absolute inset-[-30%_-60%] flex flex-wrap content-around rotate-[-18deg] opacity-[0.18] transition-opacity group-hover:opacity-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className="mono w-full text-center text-[9.5px] uppercase tracking-[0.15em] text-[#F4F1E8]">
                        Visión Pelusa
                      </span>
                    ))}
                  </div>

                  <div className="absolute left-2 top-2 z-10 rounded-sm bg-[#0B0F14]/60 px-2 py-1 font-mono text-[10px] text-[#8A9A93]">
                    {photo.number}
                  </div>

                  <div
                    className={`absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                      isSelected
                        ? "border-[#FFC94A] bg-[#FFC94A]"
                        : "border-white/60 bg-[#0B0F14]/40"
                    }`}
                  >
                    {isSelected ? (
                      <span className="block h-2 w-2 rotate-[-45deg] border-b-2 border-l-2 border-[#0B0F14]" />
                    ) : null}
                  </div>

                  <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 font-mono text-[10px] text-[#8A9A93]">
                    <span>{isSelected ? "🔓" : "🔒"}</span>
                    <span>{isSelected ? "Listo" : "Bloqueada"}</span>
                  </div>

                  <div className="absolute bottom-2 right-2 z-10 rounded-sm bg-[#0B0F14]/60 px-2 py-1 font-mono text-[11px] text-[#F4F1E8]">
                    {displayPrice}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-[4px] border border-white/10 bg-[#111820] p-6 lg:sticky lg:top-24 lg:h-fit">
          <h3 className="mb-5 text-[15px] font-semibold text-[#F4F1E8]">Tu selección</h3>

          <div className="flex items-center justify-between border-b border-white/10 py-3 text-[14px] text-[#8A9A93]">
            <span>Fotos seleccionadas</span>
            <b className="text-[#F4F1E8]">{safeSelectedCount}</b>
          </div>

          <div className="flex items-baseline justify-between py-5">
            <span className="text-[14px] text-[#8A9A93]">Total</span>
            <span className="font-mono text-[24px] text-[#FFC94A]">${safeSelectedTotal.toLocaleString("es-AR")}</span>
          </div>

          <div className="mt-3 rounded-[3px] border border-white/10 bg-[#0B0F14] p-3 text-[12.5px] text-[#8A9A93]">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[#FFC94A]">
              Precio por foto
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {[
                  [1, 1500],
                  [2, 2900],
                  [3, 4200],
                  [4, 5400],
                  [5, 6500],
                  [6, 7560],
                  [7, 8580],
                  [8, 9560],
                  [9, 10500],
                  [10, 11400],
                ].map(([label, value], index) => {
                  const safeValue = Number(value ?? 0) || 0;
                  return (
                    <tr key={`price-row-${String(label)}-${index}`} className="border-b border-white/10">
                      <td className="py-2 text-[#8A9A93]">{label} foto{Number(label) === 1 ? "" : "s"}</td>
                      <td className="py-2 text-right font-mono text-[#F4F1E8]">${safeValue.toLocaleString("es-AR")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.06em] text-[#8A9A93]">
              Email para confirmar la compra
            </span>
            <input
              type="email"
              value={buyerEmail}
              onChange={(event) => setBuyerEmail(event.target.value)}
              placeholder="tu@email.com"
              className="field-input w-full"
            />
          </label>

          <button
            type="button"
            disabled={selectedCount === 0 || isPaying}
            onClick={handleCheckout}
            className="mt-5 w-full rounded-[2px] bg-[#FFC94A] px-4 py-4 font-semibold uppercase tracking-[0.03em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {isPaying ? "Procesando..." : "Pagar con Mercado Pago"}
          </button>

          {checkoutMessage ? (
            <div className="mt-3 rounded-[3px] border border-[#FFC94A]/30 bg-[#FFC94A]/10 px-3 py-2 text-[12px] text-[#F4D582]">
              {checkoutMessage}
            </div>
          ) : null}

          <div className="mt-3 text-center font-mono text-[11px] text-[#8A9A93]">
            Pago seguro · acceso inmediato tras confirmar
          </div>
        </aside>
      </div>
    </div>
  );
}
