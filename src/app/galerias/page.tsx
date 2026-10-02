"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GalleryCard } from "@/components/gallery-card";
import { SiteHeader } from "@/components/site-header";
import {
  getPublishedGalleries,
  sanitizeGallerySearch,
  type GallerySort,
  type PublishedGalleriesResult,
} from "@/lib/data-source";

const sortOptions: Array<{ value: GallerySort; label: string }> = [
  { value: "recent", label: "Más recientes" },
  { value: "oldest", label: "Más antiguos" },
  { value: "name", label: "Nombre A-Z" },
];

const parseSort = (value: string | null): GallerySort =>
  sortOptions.some((option) => option.value === value) ? (value as GallerySort) : "recent";

const parsePage = (value: string | null) => {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
};

// Defaults (q empty, sort=recent, page=1) are left out of the URL.
const buildHref = ({ q, sort, page }: { q: string; sort: GallerySort; page: number }) => {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort !== "recent") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/galerias?${query}` : "/galerias";
};

// 1 … 4 5 6 … 20 — never one button per page.
const pageWindow = (current: number, total: number): Array<number | "gap"> => {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const items: Array<number | "gap"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) items.push("gap");
    items.push(page);
  });
  return items;
};

const controlLabel = "mono mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-[#8A9A93]";
const pagerItem = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm border px-3 font-mono text-[12px] uppercase tracking-[0.06em]";

function GalleriesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = sanitizeGallerySearch(searchParams.get("q") ?? "");
  const sort = parseSort(searchParams.get("sort"));
  const page = parsePage(searchParams.get("page"));
  const requestKey = `${q}|${sort}|${page}`;

  const [result, setResult] = useState<{ key: string; data: PublishedGalleriesResult } | null>(null);

  useEffect(() => {
    let active = true;
    void getPublishedGalleries({ page, q, sort }).then((data) => {
      if (!active) return;
      if (data.status === "out_of_range") {
        router.replace(buildHref({ q, sort, page: 1 }));
        return;
      }
      setResult({ key: requestKey, data });
    });
    return () => {
      active = false;
    };
  }, [page, q, sort, requestKey, router]);

  const isLoading = !result || result.key !== requestKey;
  const data = isLoading ? null : result.data;

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = sanitizeGallerySearch(String(new FormData(event.currentTarget).get("q") ?? ""));
    router.push(buildHref({ q: value, sort, page: 1 }));
  };

  return (
    <main className="section-shell pb-20 pt-12 sm:pt-16 md:pt-20">
      <div className="mb-8 max-w-[620px] sm:mb-10">
        <div className="mb-4 flex items-center gap-3 mono text-[10px] uppercase tracking-[0.22em] text-[#FFC94A] sm:text-[12px]">
          <span className="block h-px w-6 bg-[#FFC94A] sm:w-7" />
          Galerías
        </div>
        <h1 className="text-[clamp(30px,6vw,52px)] font-semibold leading-[1] text-[#F4F1E8]">Encontrá tu partido.</h1>
        <p className="mt-4 text-[14px] text-[#8A9A93] sm:text-[15.5px]">
          Buscá el encuentro y elegí las fotos que querés llevarte.
        </p>
      </div>

      <div className="mb-8 grid gap-4 border-y border-white/10 py-5 sm:mb-10 md:grid-cols-[1fr_220px] md:items-end">
        {/* key={q} re-mounts the input when the URL changes (back/forward, Limpiar búsqueda). */}
        <form key={q} onSubmit={handleSearch} role="search">
          <label htmlFor="gallery-search" className={controlLabel}>Buscar partido</label>
          <div className="flex gap-2">
            <input
              id="gallery-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={80}
              placeholder="Buscar por equipo o partido..."
              className="field-input min-w-0 flex-1"
            />
            <button
              type="submit"
              className="shrink-0 rounded-sm bg-[#FFC94A] px-5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] sm:text-[13px]"
            >
              Buscar
            </button>
          </div>
        </form>

        <div>
          <label htmlFor="gallery-sort" className={controlLabel}>Ordenar por</label>
          <select
            id="gallery-sort"
            value={sort}
            onChange={(event) => router.push(buildHref({ q, sort: parseSort(event.target.value), page: 1 }))}
            className="field-input cursor-pointer"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-[14px] text-[#8A9A93]" aria-live="polite">Cargando galerías...</p>
      ) : data?.status !== "ok" ? (
        <div className="rounded-[4px] border border-dashed border-white/15 bg-[#111820]/60 p-8 text-center sm:p-12">
          <h2 className="text-[20px] text-[#F4F1E8]">No pudimos cargar las galerías.</h2>
          <p className="mt-2 text-[13.5px] text-[#8A9A93]">Intentá nuevamente en unos minutos.</p>
        </div>
      ) : data.total === 0 ? (
        <div className="rounded-[4px] border border-dashed border-white/15 bg-[#111820]/60 p-8 text-center sm:p-12">
          <h2 className="text-[20px] text-[#F4F1E8]">
            {q ? "No encontramos partidos para tu búsqueda." : "No hay galerías disponibles por el momento."}
          </h2>
          {q ? (
            <Link
              href={buildHref({ q: "", sort, page: 1 })}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-sm border border-white/15 px-5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#F4F1E8] transition-colors hover:border-[#FFC94A]/70 hover:text-[#FFC94A]"
            >
              Limpiar búsqueda
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mb-5 font-mono text-[12px] text-[#8A9A93]" aria-live="polite">
            {data.total === 1 ? "1 galería" : `${data.total} galerías`}
            {q ? ` para “${q}”` : ""}
            {data.totalPages > 1 ? ` · página ${data.page} de ${data.totalPages}` : ""}
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.cards.map((card, index) => (
              <GalleryCard key={card.slug} card={card} index={index} />
            ))}
          </div>

          {data.totalPages > 1 ? (
            <nav aria-label="Paginación" className="mt-12 flex flex-wrap items-center justify-center gap-2">
              {data.page > 1 ? (
                <Link href={buildHref({ q, sort, page: data.page - 1 })} className={`${pagerItem} border-white/15 text-[#F4F1E8] hover:border-[#FFC94A]/70 hover:text-[#FFC94A]`}>
                  Anterior
                </Link>
              ) : (
                <span aria-disabled="true" className={`${pagerItem} border-white/5 text-[#8A9A93]/50`}>Anterior</span>
              )}

              {pageWindow(data.page, data.totalPages).map((item, index) =>
                item === "gap" ? (
                  <span key={`gap-${index}`} className="px-1 font-mono text-[12px] text-[#8A9A93]">…</span>
                ) : item === data.page ? (
                  <span key={item} aria-current="page" className={`${pagerItem} border-[#FFC94A] bg-[#FFC94A] font-semibold text-[#0B0F14]`}>
                    {item}
                  </span>
                ) : (
                  <Link key={item} href={buildHref({ q, sort, page: item })} className={`${pagerItem} border-white/15 text-[#F4F1E8] hover:border-[#FFC94A]/70 hover:text-[#FFC94A]`}>
                    {item}
                  </Link>
                ),
              )}

              {data.page < data.totalPages ? (
                <Link href={buildHref({ q, sort, page: data.page + 1 })} className={`${pagerItem} border-white/15 text-[#F4F1E8] hover:border-[#FFC94A]/70 hover:text-[#FFC94A]`}>
                  Siguiente
                </Link>
              ) : (
                <span aria-disabled="true" className={`${pagerItem} border-white/5 text-[#8A9A93]/50`}>Siguiente</span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}

export default function GaleriasPage() {
  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <div className="grain" />
      <SiteHeader />
      <Suspense fallback={<p className="section-shell py-16 text-center text-[14px] text-[#8A9A93]">Cargando galerías...</p>}>
        <GalleriesContent />
      </Suspense>
    </div>
  );
}
