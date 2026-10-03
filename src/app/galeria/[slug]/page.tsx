"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getMatchBySlug, getPhotosByMatchSlug } from "@/lib/data-source";
import { getPriceForCount } from "@/lib/mock-data";

export default function GalleryPage() {
  const params = useParams<{ slug: string }>();
  const resolvedSlug = typeof params?.slug === "string" ? params.slug : null;
  type GalleryPhoto = {
    id: string;
    number: number;
    title: string;
    price: number;
    watermarkUrl?: string;
    thumbnailUrl?: string;
  };

  const [selected, setSelected] = useState<string[]>([]);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [photoData, setPhotoData] = useState<GalleryPhoto[]>([]);
  const [match, setMatch] = useState<{ slug: string; tag?: string; title: string; subtitle: string; venue: string; date: string; photoCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);

  const visiblePhotoCount = Math.max(photoData.length, match?.photoCount ?? 0);

  const normalizedPhotoData = useMemo(() => {
    const unique = new Map<string, GalleryPhoto>();

    photoData.forEach((photo, index) => {
      const id = String(photo.id);
      const number = Number.isFinite(Number(photo.number)) ? Number(photo.number) : index + 1;
      const price = Number.isFinite(Number(photo.price)) ? Number(photo.price) : 1500;
      const watermarkUrl = typeof photo.watermarkUrl === "string" ? photo.watermarkUrl : undefined;
      const thumbnailUrl = typeof photo.thumbnailUrl === "string" ? photo.thumbnailUrl : undefined;

      if (!unique.has(id)) {
        unique.set(id, {
          ...photo,
          id,
          number,
          price,
          watermarkUrl,
          thumbnailUrl,
        });
      }
    });

    return Array.from(unique.values());
  }, [photoData]);

  useEffect(() => {
    if (!resolvedSlug) {
      setMatch(null);
      setPhotoData([]);
      setIsLoading(false);
      setLoadingMessage("La galería solicitada no existe.");
      return;
    }

    setIsLoading(true);
    setLoadingMessage(null);
    setCheckoutMessage(null);

    void Promise.all([
      getMatchBySlug(resolvedSlug),
      getPhotosByMatchSlug(resolvedSlug),
    ])
      .then(([matchData, photos]) => {
        console.log("Gallery page result:", { resolvedSlug, matchData, photos: photos ?? [], length: photos?.length ?? 0 });
        setMatch(matchData ?? null);
        setPhotoData(Array.isArray(photos) ? photos : []);
        setIsLoading(false);
        setLoadingMessage(matchData ? null : "No se encontró la galería solicitada.");
      })
      .catch((error) => {
        console.error("gallery query failed", error);
        setMatch(null);
        setPhotoData([]);
        setIsLoading(false);
        setLoadingMessage("No se pudo consultar la galería. Intentá nuevamente.");
      });
  }, [resolvedSlug]);

  const selectedCount = selected.length;
  const selectedTotal = useMemo(() => {
    const total = getPriceForCount(selectedCount);
    return Number.isFinite(total) ? total : 0;
  }, [selectedCount]);

  const safeSelectedTotal = Number.isFinite(selectedTotal) ? selectedTotal : 0;
  const safeSelectedCount = Number.isFinite(selectedCount) ? selectedCount : 0;

  const togglePhoto = (id: string) => {
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
        // The purchase is persisted only after the server verifies the payment with Mercado Pago.
        window.location.href = payload.checkoutUrl;
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

  const renderGalleryState = () => {
    if (isLoading) {
      return (
        <div className="section-shell py-16">
          <div className="rounded-[4px] border border-white/10 bg-[#111820] p-8 text-[#8A9A93]">
            <div className="mono text-[11px] uppercase tracking-[0.2em] text-[#FFC94A]">Cargando galería</div>
            <h2 className="mt-4 text-[22px] text-[#F4F1E8]">Buscando la galería solicitada...</h2>
          </div>
        </div>
      );
    }

    if (loadingMessage) {
      return (
        <div className="section-shell py-16">
          <div className="rounded-[4px] border border-white/10 bg-[#111820] p-8 text-[#8A9A93]">
            <div className="mono text-[11px] uppercase tracking-[0.2em] text-[#FFC94A]">Galería no disponible</div>
            <h2 className="mt-4 text-[22px] text-[#F4F1E8]">{loadingMessage}</h2>
          </div>
        </div>
      );
    }

    if (!match && normalizedPhotoData.length === 0) {
      return (
        <div className="section-shell py-16">
          <div className="rounded-[4px] border border-white/10 bg-[#111820] p-8 text-[#8A9A93]">
            <div className="mono text-[11px] uppercase tracking-[0.2em] text-[#FFC94A]">Sin información</div>
            <h2 className="mt-4 text-[22px] text-[#F4F1E8]">No se encontró la galería solicitada.</h2>
          </div>
        </div>
      );
    }

    return null;
  };

  const showGalleryContent = !(isLoading || loadingMessage || (!match && normalizedPhotoData.length === 0));

  return (
    <>
      {renderGalleryState() ?? null}
      {showGalleryContent && (
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
                  // Watermarked thumbnail (or preview) whether selected or not: the original never reaches the page.
                  const mediaUrl = photo.thumbnailUrl || photo.watermarkUrl || "/logo-vision-pelusa.svg";

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
                  placeholder="nombre@correo.com"
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
      )}
    </>
  );
}
